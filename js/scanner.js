// ===== ESCÁNER OCR OPTIMIZADO PARA CELULAR =====

let scannerActivo = false;
let ultimoCodigoEscaneado = null;
let datosEscaneados = null;
let modoScanner = 'registro';

// ===== VARIABLES PARA OCR =====
let ocrWorker = null;
let ocrProcesando = false;
let ocrInterval = null;
let ocrIntentos = 0;
let videoStream = null;
let videoElement = null;
let canvasElement = null;
let ultimoCodigoValido = '';
let contadorCodigoValido = 0;

// ===== CONFIGURACIÓN =====
const OCR_CONFIG = {
    idioma: 'spa',
    intervalo: 1800, // ms entre capturas (más lento para mejor precisión)
    maxIntentos: 40,
    escala: 3, // Escalar más para mejor lectura
    confianzaMinima: 20
};

// ===== PARSEAR TICKET =====
function parseTicketData(texto) {
    const lines = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let resultado = {
        codigo: '',
        nombre: '',
        celular: '',
        detalle: '',
        fecha: '',
        tienda: ''
    };
    
    if (lines.length === 0) return resultado;
    
    // 1. BUSCAR CÓDIGO (prioridad absoluta)
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^([A-Za-z])(\d+)$/);
        if (match) {
            resultado.codigo = match[1].toUpperCase() + match[2];
            lines.splice(i, 1);
            break;
        }
    }
    
    // Si no se encontró, buscar en cualquier parte
    if (!resultado.codigo) {
        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(/([A-Za-z])(\d+)/);
            if (match) {
                resultado.codigo = match[1].toUpperCase() + match[2];
                lines.splice(i, 1);
                break;
            }
        }
    }
    
    // Si aún no hay código, intentar con la primera línea que tenga letra+número
    if (!resultado.codigo) {
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(/[A-Za-z]/) && lines[i].match(/\d/)) {
                const match = lines[i].match(/([A-Za-z])(\d+)/);
                if (match) {
                    resultado.codigo = match[1].toUpperCase() + match[2];
                    lines.splice(i, 1);
                    break;
                }
            }
        }
    }
    
    // 2. BUSCAR NOMBRE
    if (lines.length > 0) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Excluir: números, fechas, "MEDIA LUNA", líneas con ":"
            if (!line.match(/^\d{7,10}$/) && 
                !line.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/) &&
                !line.toLowerCase().includes('media luna') &&
                !line.includes(':') &&
                !line.match(/^\d+$/) &&
                line.length > 2) {
                resultado.nombre = line;
                lines.splice(i, 1);
                break;
            }
        }
        
        // Si no se encontró nombre, usar la primera línea que no sea número
        if (!resultado.nombre) {
            for (let i = 0; i < lines.length; i++) {
                if (!lines[i].match(/^\d{7,10}$/) && 
                    !lines[i].match(/\d{1,2}\/\d{1,2}\/\d{2,4}/) &&
                    !lines[i].toLowerCase().includes('media luna')) {
                    resultado.nombre = lines[i];
                    lines.splice(i, 1);
                    break;
                }
            }
        }
    }
    
    // 3. BUSCAR CELULAR (7-10 dígitos)
    for (let i = 0; i < lines.length; i++) {
        const clean = lines[i].replace(/\s/g, '');
        if (clean.match(/^\d{7,10}$/)) {
            resultado.celular = clean;
            lines.splice(i, 1);
            break;
        }
    }
    
    // 4. BUSCAR FECHA
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
        if (match) {
            resultado.fecha = match[1];
            lines.splice(i, 1);
            break;
        }
    }
    
    // 5. BUSCAR TIENDA
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('media luna')) {
            resultado.tienda = 'MEDIA LUNA';
            lines.splice(i, 1);
            break;
        }
    }
    
    // 6. DETALLE (lo que quede como descripción)
    if (lines.length > 0 && !resultado.detalle) {
        resultado.detalle = lines.join(' ');
    }
    
    return resultado;
}

// ===== PREPROCESAMIENTO DE IMAGEN =====
function preprocesarImagen(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Escala de grises + contraste + brillo
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Luma
        let gray = 0.299 * r + 0.587 * g + 0.114 * b;
        // Aumentar contraste y brillo
        gray = Math.max(0, Math.min(255, (gray - 128) * 1.5 + 140));
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
    }
    ctx.putImageData(imageData, 0, 0);
    
    // Escalar la imagen para mejor OCR
    const escala = OCR_CONFIG.escala;
    const scaledCanvas = document.createElement('canvas');
    const scaledCtx = scaledCanvas.getContext('2d');
    const newWidth = canvas.width * escala;
    const newHeight = canvas.height * escala;
    scaledCanvas.width = newWidth;
    scaledCanvas.height = newHeight;
    scaledCtx.imageSmoothingEnabled = true;
    scaledCtx.imageSmoothingQuality = 'high';
    scaledCtx.drawImage(canvas, 0, 0, newWidth, newHeight);
    
    return scaledCanvas;
}

// ===== PROCESAR OCR =====
async function procesarOCR() {
    if (ocrProcesando) return;
    if (!videoElement || !videoElement.videoWidth) return;
    if (!canvasElement) return;
    
    // Iniciar worker si no existe
    if (!ocrWorker) {
        try {
            ocrWorker = await Tesseract.createWorker(OCR_CONFIG.idioma);
            console.log('✅ Worker OCR iniciado');
        } catch (e) {
            console.error('❌ Error al crear worker:', e);
            return;
        }
    }
    
    ocrProcesando = true;
    ocrIntentos++;
    
    try {
        // Capturar frame
        const ctx = canvasElement.getContext('2d');
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
        ctx.drawImage(videoElement, 0, 0);
        
        // Recortar zona central (donde está el ticket)
        const centerX = canvasElement.width * 0.1;
        const centerY = canvasElement.height * 0.1;
        const cropWidth = canvasElement.width * 0.8;
        const cropHeight = canvasElement.height * 0.8;
        
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropWidth;
        cropCanvas.height = cropHeight;
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx.drawImage(canvasElement, centerX, centerY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        
        // Preprocesar
        const processedCanvas = preprocesarImagen(cropCanvas);
        
        // OCR
        const result = await ocrWorker.recognize(processedCanvas);
        const text = result.data.text || '';
        const confidence = result.data.confidence || 0;
        
        console.log('📝 OCR:', text);
        console.log('📊 Confianza:', Math.round(confidence) + '%');
        
        // Actualizar UI
        const ocrStatusText = document.getElementById('ocrStatusText');
        const ocrConfidence = document.getElementById('ocrConfidence');
        if (ocrConfidence) {
            ocrConfidence.textContent = 'Confianza: ' + Math.round(confidence) + '%';
        }
        
        // Parsear
        const datos = parseTicketData(text);
        console.log('📊 Datos parseados:', datos);
        
        // VALIDAR: debe tener código y nombre
        if (datos.codigo && datos.nombre) {
            // Verificar consistencia
            if (datos.codigo === ultimoCodigoValido) {
                contadorCodigoValido++;
            } else {
                ultimoCodigoValido = datos.codigo;
                contadorCodigoValido = 1;
            }
            
            // Aceptar si: 2 confirmaciones O confianza alta (>50)
            if (contadorCodigoValido >= 2 || confidence > 50) {
                console.log('✅ TICKET VÁLIDO!');
                ultimoCodigoEscaneado = datos.codigo;
                datosEscaneados = datos;
                
                // Detener todo
                detenerOcr();
                detenerScanner();
                
                // Actualizar UI
                const ultimoElement = document.getElementById('ultimoCodigoEscaner');
                if (ultimoElement) {
                    ultimoElement.textContent = 'Último: ' + datos.codigo;
                }
                
                // Procesar según modo
                const paqueteExistente = DB.getPaqueteByCodigo(datos.codigo);
                
                if (modoScanner === 'registro') {
                    if (paqueteExistente) {
                        mostrarToast('⚠️ Código ' + datos.codigo + ' ya existe', 'warning');
                        cambiarModoScanner('consulta');
                        mostrarPaqueteEscaneado(paqueteExistente);
                        ocultarFormularioRapido();
                    } else {
                        const config = DB.getConfiguracion();
                        const nuevoPaquete = {
                            codigo: datos.codigo,
                            clienteNombre: datos.nombre,
                            clienteCelular: datos.celular || '',
                            detalle: datos.detalle || '',
                            quienDejo: '',
                            fechaIngreso: new Date().toISOString().split('T')[0],
                            fechaTicket: datos.fecha || '',
                            tienda: datos.tienda || 'MEDIA LUNA',
                            precioBase: config.precioBase || 3,
                            estado: 'pendiente',
                            pagado: false
                        };
                        
                        const guardado = DB.addPaqueteDirecto(nuevoPaquete);
                        if (guardado) {
                            mostrarToast('✅ Paquete ' + datos.codigo + ' registrado', 'success');
                            const paqueteGuardado = DB.getPaqueteByCodigo(datos.codigo);
                            mostrarPaqueteEscaneado(paqueteGuardado);
                            actualizarDashboard();
                            actualizarListas();
                            actualizarBadge();
                        } else {
                            mostrarToast('❌ Error al guardar', 'error');
                        }
                    }
                } else {
                    // Modo consulta
                    if (paqueteExistente) {
                        mostrarPaqueteEscaneado(paqueteExistente);
                        ocultarFormularioRapido();
                        mostrarToast('📦 Paquete ' + datos.codigo + ' encontrado', 'success');
                    } else {
                        mostrarToast('❌ Paquete ' + datos.codigo + ' no encontrado', 'error');
                        mostrarFormularioRapido(datos.codigo, datos.nombre, datos.celular, datos.detalle);
                    }
                }
                
                ocrProcesando = false;
                return;
            }
        }
        
        // Mostrar estado en UI
        if (ocrStatusText) {
            if (datos.codigo && !datos.nombre) {
                ocrStatusText.textContent = '📷 Código: ' + datos.codigo + ' - Buscando nombre...';
            } else if (!datos.codigo) {
                ocrStatusText.textContent = '📷 Buscando código... Acerca el ticket';
            } else if (datos.codigo && datos.nombre) {
                ocrStatusText.textContent = '✅ ' + datos.codigo + ' - ' + datos.nombre;
            } else {
                ocrStatusText.textContent = '🔄 Reintentando... (' + ocrIntentos + '/' + OCR_CONFIG.maxIntentos + ')';
            }
        }
        
        // Reintentar
        if (ocrIntentos >= OCR_CONFIG.maxIntentos) {
            mostrarToast('⚠️ No se pudo leer. Acércate y mejora la iluminación.', 'warning');
            ocrIntentos = 0;
        }
        
    } catch (error) {
        console.error('❌ Error en OCR:', error);
    }
    
    ocrProcesando = false;
}

// ===== INICIAR OCR =====
function iniciarOcr() {
    if (ocrInterval) {
        clearInterval(ocrInterval);
        ocrInterval = null;
    }
    
    ocrIntentos = 0;
    ultimoCodigoValido = '';
    contadorCodigoValido = 0;
    
    const ocrStatus = document.getElementById('ocrStatus');
    const ocrStatusText = document.getElementById('ocrStatusText');
    const ocrConfidence = document.getElementById('ocrConfidence');
    
    if (ocrStatus) ocrStatus.style.display = 'block';
    if (ocrStatusText) ocrStatusText.textContent = '🔎 Leyendo ticket...';
    if (ocrConfidence) ocrConfidence.textContent = 'Confianza: --';
    
    // Primer intento inmediato
    setTimeout(procesarOCR, 800);
    ocrInterval = setInterval(procesarOCR, OCR_CONFIG.intervalo);
}

// ===== DETENER OCR =====
function detenerOcr() {
    if (ocrInterval) {
        clearInterval(ocrInterval);
        ocrInterval = null;
    }
    ocrProcesando = false;
    const ocrStatus = document.getElementById('ocrStatus');
    if (ocrStatus) ocrStatus.style.display = 'none';
}

// ===== INICIAR CÁMARA =====
async function iniciarCamara() {
    try {
        const constraints = {
            video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        };
        
        videoStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement = document.createElement('video');
        videoElement.srcObject = videoStream;
        videoElement.setAttribute('playsinline', '');
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';
        videoElement.style.objectFit = 'cover';
        
        return new Promise((resolve) => {
            videoElement.onloadedmetadata = function() {
                videoElement.play();
                console.log('📷 Cámara iniciada:', videoElement.videoWidth + 'x' + videoElement.videoHeight);
                
                canvasElement = document.createElement('canvas');
                
                // Limpiar y agregar video al contenedor
                const container = document.getElementById('scannerContainer');
                if (container) {
                    container.innerHTML = '';
                    container.appendChild(videoElement);
                    container.style.position = 'relative';
                    container.style.background = '#000';
                    container.style.minHeight = '250px';
                    container.style.maxHeight = '70vh';
                    container.style.overflow = 'hidden';
                    container.style.display = 'flex';
                    container.style.alignItems = 'center';
                    container.style.justifyContent = 'center';
                    
                    // Agregar overlay con guía
                    const overlay = document.createElement('div');
                    overlay.id = 'scannerOverlay';
                    overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;display:flex;align-items:center;justify-content:center;';
                    overlay.innerHTML = `
                        <div style="width:75%;max-width:320px;height:50%;border:2px dashed rgba(255,255,255,0.4);border-radius:12px;position:relative;box-shadow:inset 0 0 40px rgba(108,92,231,0.1);">
                            <div style="position:absolute;top:-2px;left:-2px;width:20px;height:20px;border-top:3px solid #6C5CE7;border-left:3px solid #6C5CE7;border-radius:3px 0 0 0;"></div>
                            <div style="position:absolute;top:-2px;right:-2px;width:20px;height:20px;border-top:3px solid #6C5CE7;border-right:3px solid #6C5CE7;border-radius:0 3px 0 0;"></div>
                            <div style="position:absolute;bottom:-2px;left:-2px;width:20px;height:20px;border-bottom:3px solid #6C5CE7;border-left:3px solid #6C5CE7;border-radius:0 0 0 3px;"></div>
                            <div style="position:absolute;bottom:-2px;right:-2px;width:20px;height:20px;border-bottom:3px solid #6C5CE7;border-right:3px solid #6C5CE7;border-radius:0 0 3px 0;"></div>
                            <div style="position:absolute;bottom:10%;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.7);font-size:12px;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,0.8);background:rgba(0,0,0,0.5);padding:4px 14px;border-radius:16px;white-space:nowrap;font-family:sans-serif;">📄 Coloca el ticket aquí</div>
                        </div>
                    `;
                    container.appendChild(overlay);
                    
                    // Estado OCR
                    const status = document.createElement('div');
                    status.id = 'ocrStatus';
                    status.style.cssText = 'display:none;position:absolute;bottom:12px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:white;padding:6px 16px;border-radius:16px;font-size:12px;z-index:10;text-align:center;backdrop-filter:blur(4px);white-space:nowrap;font-family:sans-serif;';
                    status.innerHTML = `<span id="ocrStatusText">🔎 Leyendo...</span> <span id="ocrConfidence" style="margin-left:8px;font-size:10px;opacity:0.6;">Confianza: --</span>`;
                    container.appendChild(status);
                }
                
                resolve(true);
            };
            
            videoElement.onerror = function() {
                resolve(false);
            };
        });
    } catch (error) {
        console.error('❌ Error al iniciar cámara:', error);
        return false;
    }
}

// ===== DETENER CÁMARA =====
function detenerCamara() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    if (videoElement) {
        videoElement.pause();
        videoElement.srcObject = null;
        videoElement = null;
    }
    canvasElement = null;
    
    const container = document.getElementById('scannerContainer');
    if (container) {
        container.innerHTML = '';
        container.classList.add('hidden');
        container.style.display = 'none';
    }
}

// ===== INICIAR ESCÁNER =====
function iniciarScanner() {
    if (scannerActivo) {
        mostrarToast('⚠️ El escáner ya está activo', 'warning');
        return;
    }
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        mostrarToast('⚠️ Tu navegador no soporta cámara', 'error');
        return;
    }
    
    const btnIniciar = document.getElementById('btnIniciarScanner');
    const btnDetener = document.getElementById('btnDetenerScanner');
    const resultDiv = document.getElementById('scannerResult');
    const formRapido = document.getElementById('formularioRapido');
    const container = document.getElementById('scannerContainer');
    
    if (btnIniciar) btnIniciar.classList.add('hidden');
    if (btnDetener) btnDetener.classList.remove('hidden');
    if (resultDiv) {
        resultDiv.classList.add('hidden');
        resultDiv.style.display = 'none';
    }
    if (formRapido) formRapido.classList.add('hidden');
    if (container) {
        container.classList.remove('hidden');
        container.style.display = 'flex';
    }
    
    iniciarCamara().then(success => {
        if (success) {
            scannerActivo = true;
            setTimeout(iniciarOcr, 500);
            mostrarToast('📷 Cámara activada - Modo ' + (modoScanner === 'registro' ? 'REGISTRO' : 'CONSULTA'), 'success');
            console.log('✅ Scanner iniciado');
        } else {
            if (btnIniciar) btnIniciar.classList.remove('hidden');
            if (btnDetener) btnDetener.classList.add('hidden');
            if (container) {
                container.classList.add('hidden');
                container.style.display = 'none';
            }
            scannerActivo = false;
            mostrarToast('❌ No se pudo acceder a la cámara', 'error');
        }
    });
}

// ===== DETENER ESCÁNER =====
function detenerScanner() {
    detenerOcr();
    detenerCamara();
    scannerActivo = false;
    
    const btnIniciar = document.getElementById('btnIniciarScanner');
    const btnDetener = document.getElementById('btnDetenerScanner');
    const container = document.getElementById('scannerContainer');
    
    if (btnIniciar) btnIniciar.classList.remove('hidden');
    if (btnDetener) btnDetener.classList.add('hidden');
    if (container) {
        container.classList.add('hidden');
        container.style.display = 'none';
    }
    
    if (ocrWorker) {
        try { ocrWorker.terminate(); } catch(e) {}
        ocrWorker = null;
    }
    
    console.log('⏹ Scanner detenido');
}

// ===== FORZAR ESCÁNER =====
function forzarScanner() {
    mostrarToast('🔄 Reiniciando...', 'warning');
    detenerScanner();
    setTimeout(iniciarScanner, 800);
}

// ===== REINICIAR ESCÁNER =====
function reiniciarScanner() {
    ultimoCodigoEscaneado = null;
    datosEscaneados = null;
    
    const resultDiv = document.getElementById('scannerResult');
    const formRapido = document.getElementById('formularioRapido');
    
    if (resultDiv) {
        resultDiv.classList.add('hidden');
        resultDiv.style.display = 'none';
    }
    if (formRapido) formRapido.classList.add('hidden');
    
    detenerScanner();
    setTimeout(iniciarScanner, 500);
}

// ===== CAMBIAR MODO =====
function cambiarModoScanner(modo) {
    modoScanner = modo;
    const btnRegistro = document.getElementById('modoRegistro');
    const btnConsulta = document.getElementById('modoConsulta');
    
    if (btnRegistro && btnConsulta) {
        if (modo === 'registro') {
            btnRegistro.className = 'btn-primary';
            btnConsulta.className = 'btn-secondary';
            const labelReg = document.getElementById('modoRegistroLabel');
            const labelCon = document.getElementById('modoConsultaLabel');
            const desc = document.getElementById('modoDescripcion');
            if (labelReg) labelReg.textContent = '📝 Modo Registro';
            if (labelCon) labelCon.textContent = '🔍 Modo Consulta';
            if (desc) desc.textContent = '📝 Registro: Guarda automáticamente tickets nuevos';
        } else {
            btnConsulta.className = 'btn-primary';
            btnRegistro.className = 'btn-secondary';
            const labelReg = document.getElementById('modoRegistroLabel');
            const labelCon = document.getElementById('modoConsultaLabel');
            const desc = document.getElementById('modoDescripcion');
            if (labelReg) labelReg.textContent = '📝 Registro';
            if (labelCon) labelCon.textContent = '🔍 Modo Consulta';
            if (desc) desc.textContent = '🔍 Consulta: Busca y muestra detalles de paquetes existentes';
        }
    }
    
    mostrarToast('📷 Modo: ' + (modo === 'registro' ? 'Registro' : 'Consulta'), 'success');
    
    if (scannerActivo) {
        detenerScanner();
        setTimeout(iniciarScanner, 500);
    }
}

// ===== MOSTRAR PAQUETE ESCANEADO =====
function mostrarPaqueteEscaneado(paquete) {
    const infoDiv = document.getElementById('paqueteInfo');
    if (!infoDiv) return;
    
    const config = DB.getConfiguracion();
    const moneda = config.moneda || 'Bs';
    const deuda = DB.calcularDeuda(paquete);
    const dias = DB.calcularDias(paquete.fechaIngreso);
    const precioBase = paquete.precioBase || config.precioBase || 3;
    const diasGratis = config.diasGratis || 5;
    const tieneRecargo = dias > diasGratis;
    const diasExtra = tieneRecargo ? dias - diasGratis : 0;
    const recargo = config.recargo || 0.50;
    
    const badgeClass = {
        'pendiente': 'badge-pendiente',
        'entregado': 'badge-entregado'
    }[paquete.estado] || '';
    
    infoDiv.innerHTML = `
        <div style="text-align:center;margin-bottom:10px;">
            <span style="font-size:28px;font-weight:bold;color:#6C5CE7;">${paquete.codigo}</span>
        </div>
        <p><strong>👤 Cliente:</strong> ${paquete.clienteNombre}</p>
        <p><strong>📱 Celular:</strong> ${paquete.clienteCelular || 'N/A'}</p>
        <p><strong>📝 Detalle:</strong> ${paquete.detalle || 'Sin detalle'}</p>
        <p><strong>📅 Fecha ingreso:</strong> ${paquete.fechaIngreso}</p>
        <p><strong>📅 Días:</strong> ${dias} días</p>
        ${tieneRecargo ? `<p><strong>📈 Recargo:</strong> ${moneda} ${(diasExtra * recargo).toFixed(2)} (${diasExtra} días extra)</p>` : '<p><strong>📈 Sin recargo</p>'}
        <p><strong>💰 Deuda:</strong> <span style="font-size:18px;font-weight:bold;color:${deuda > precioBase ? '#E17055' : '#00B894'};">${moneda} ${deuda}</span></p>
        <p><strong>📊 Estado:</strong> <span class="badge ${badgeClass}">${paquete.estado === 'pendiente' ? '⏳ Pendiente' : '✅ Entregado'}</span></p>
    `;
    
    const resultDiv = document.getElementById('scannerResult');
    if (resultDiv) {
        resultDiv.classList.remove('hidden');
        resultDiv.style.display = 'block';
    }
    
    const btnEntregar = document.getElementById('btnEntregarScanner');
    const btnEliminar = document.getElementById('btnEliminarScanner');
    
    if (btnEntregar) {
        btnEntregar.style.display = (paquete.estado === 'pendiente' && modoScanner === 'consulta') ? 'inline-flex' : 'none';
    }
    if (btnEliminar) {
        btnEliminar.style.display = modoScanner === 'consulta' ? 'inline-flex' : 'none';
    }
    
    ocultarFormularioRapido();
}

// ===== FORMULARIO RÁPIDO =====
function mostrarFormularioRapido(codigo, nombre, celular, detalle) {
    const form = document.getElementById('formularioRapido');
    if (form) {
        form.classList.remove('hidden');
        const paqCodigo = document.getElementById('paqCodigo');
        const paqNombre = document.getElementById('paqNombre');
        const paqCelular = document.getElementById('paqCelular');
        const paqDetalle = document.getElementById('paqDetalle');
        const paqQuienDejo = document.getElementById('paqQuienDejo');
        if (paqCodigo) paqCodigo.value = codigo || '';
        if (paqNombre) paqNombre.value = nombre || '';
        if (paqCelular) paqCelular.value = celular || '';
        if (paqDetalle) paqDetalle.value = detalle || '';
        if (paqQuienDejo) paqQuienDejo.value = '';
        if (paqNombre) paqNombre.focus();
        form.scrollIntoView({ behavior: 'smooth' });
    }
}

function ocultarFormularioRapido() {
    const form = document.getElementById('formularioRapido');
    if (form) form.classList.add('hidden');
}

// ===== GUARDAR PAQUETE FORM =====
function guardarPaqueteForm(e) {
    e.preventDefault();
    
    const codigo = document.getElementById('paqCodigo').value.trim().toUpperCase();
    const nombre = document.getElementById('paqNombre').value.trim();
    const celular = document.getElementById('paqCelular').value.trim();
    const detalle = document.getElementById('paqDetalle').value.trim();
    const quienDejo = document.getElementById('paqQuienDejo').value.trim();
    
    if (!codigo || !nombre) {
        mostrarToast('⚠️ Código y nombre obligatorios', 'error');
        return;
    }
    
    if (DB.getPaqueteByCodigo(codigo)) {
        mostrarToast('⚠️ El código ' + codigo + ' ya existe', 'error');
        return;
    }
    
    const config = DB.getConfiguracion();
    const paquete = {
        codigo: codigo,
        clienteNombre: nombre,
        clienteCelular: celular || '',
        detalle: detalle || '',
        quienDejo: quienDejo || '',
        fechaIngreso: new Date().toISOString().split('T')[0],
        precioBase: config.precioBase || 3,
        estado: 'pendiente',
        pagado: false
    };
    
    DB.addPaqueteDirecto(paquete);
    mostrarToast('✅ Paquete ' + codigo + ' guardado', 'success');
    
    ocultarFormularioRapido();
    const resultDiv = document.getElementById('scannerResult');
    if (resultDiv) {
        resultDiv.classList.add('hidden');
        resultDiv.style.display = 'none';
    }
    
    actualizarDashboard();
    actualizarListas();
    actualizarBadge();
}

// ===== MARCAR ENTREGADO =====
function marcarEntregadoDesdeScanner() {
    if (!ultimoCodigoEscaneado) {
        mostrarToast('⚠️ No hay paquete escaneado', 'warning');
        return;
    }
    const paquete = DB.getPaqueteByCodigo(ultimoCodigoEscaneado);
    if (!paquete) {
        mostrarToast('❌ Paquete no encontrado', 'error');
        return;
    }
    if (paquete.estado === 'entregado') {
        mostrarToast('✅ Ya fue entregado', 'success');
        return;
    }
    const deuda = DB.calcularDeuda(paquete);
    const moneda = DB.getConfiguracion().moneda || 'Bs';
    if (confirm('¿Marcar ' + paquete.codigo + ' como ENTREGADO?\nDeuda: ' + moneda + ' ' + deuda)) {
        DB.marcarEntregado(paquete.id);
        mostrarToast('✅ Paquete ' + paquete.codigo + ' entregado', 'success');
        const actualizado = DB.getPaqueteByCodigo(ultimoCodigoEscaneado);
        mostrarPaqueteEscaneado(actualizado);
        actualizarDashboard();
        actualizarListas();
        actualizarBadge();
    }
}

// ===== ELIMINAR =====
function eliminarDesdeScanner() {
    if (!ultimoCodigoEscaneado) {
        mostrarToast('⚠️ No hay paquete escaneado', 'warning');
        return;
    }
    const paquete = DB.getPaqueteByCodigo(ultimoCodigoEscaneado);
    if (!paquete) {
        mostrarToast('❌ Paquete no encontrado', 'error');
        return;
    }
    if (confirm('¿Eliminar ' + paquete.codigo + '? No se puede deshacer.')) {
        DB.deletePaquete(paquete.id);
        mostrarToast('🗑️ Paquete ' + paquete.codigo + ' eliminado', 'error');
        reiniciarScanner();
        actualizarDashboard();
        actualizarListas();
        actualizarBadge();
    }
}

// ===== BUSCAR POR CÓDIGO =====
function buscarPorCodigo() {
    const input = document.getElementById('codigoManual');
    if (!input) return;
    
    let codigo = input.value.trim().toUpperCase();
    if (!codigo) {
        mostrarToast('⚠️ Ingresa un código', 'warning');
        input.focus();
        return;
    }
    
    if (!codigo.match(/^[A-Z]\d+$/)) {
        mostrarToast('⚠️ Formato inválido. Ej: A1, B25', 'error');
        input.focus();
        return;
    }
    
    ultimoCodigoEscaneado = codigo;
    const ultimoElement = document.getElementById('ultimoCodigoEscaner');
    if (ultimoElement) ultimoElement.textContent = 'Último: ' + codigo;
    
    const paquete = DB.getPaqueteByCodigo(codigo);
    if (paquete) {
        cambiarModoScanner('consulta');
        mostrarPaqueteEscaneado(paquete);
        if (scannerActivo) detenerScanner();
    } else {
        cambiarModoScanner('registro');
        mostrarFormularioRapido(codigo, '', '', '');
        const resultDiv = document.getElementById('scannerResult');
        if (resultDiv) {
            resultDiv.classList.add('hidden');
            resultDiv.style.display = 'none';
        }
        if (scannerActivo) detenerScanner();
    }
    input.value = '';
}

// ===== CANCELAR FORMULARIO =====
function cancelarFormulario() {
    ocultarFormularioRapido();
    reiniciarScanner();
}

// ===== EXPORTAR =====
window.cambiarModoScanner = cambiarModoScanner;
window.forzarScanner = forzarScanner;
window.iniciarScanner = iniciarScanner;
window.detenerScanner = detenerScanner;
window.reiniciarScanner = reiniciarScanner;
window.buscarPorCodigo = buscarPorCodigo;
window.marcarEntregadoDesdeScanner = marcarEntregadoDesdeScanner;
window.eliminarDesdeScanner = eliminarDesdeScanner;
window.guardarPaqueteForm = guardarPaqueteForm;
window.cancelarFormulario = cancelarFormulario;

// Para app.js
window._cambiarModoScanner = cambiarModoScanner;
window._forzarScanner = forzarScanner;
window._iniciarScanner = iniciarScanner;
window._detenerScanner = detenerScanner;
window._reiniciarScanner = reiniciarScanner;
window._buscarPorCodigo = buscarPorCodigo;
window._marcarEntregadoDesdeScanner = marcarEntregadoDesdeScanner;
window._eliminarDesdeScanner = eliminarDesdeScanner;
window._guardarPaqueteForm = guardarPaqueteForm;
window._cancelarFormulario = cancelarFormulario;