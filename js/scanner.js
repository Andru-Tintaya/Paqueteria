// ===== ESCÁNER QR + OCR CON TESSERACT =====

let scannerInstance = null;
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
let canvasCtx = null;
let ultimoTextoOCR = '';
let confianzaOCR = 0;
let codigosDetectados = [];
let ultimoCodigoValido = '';
let contadorCodigoValido = 0;

// ===== CONFIGURACIÓN DE OCR =====
const OCR_CONFIG = {
    idioma: 'spa',
    intervalo: 1500,
    maxIntentos: 30,
    escala: 2.5,
    confianzaMinima: 30
};

// ===== FUNCIÓN PARA PARSEAR EL CONTENIDO DEL TICKET =====
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
    
    // 1. BUSCAR CÓDIGO
    let codigoEncontrado = '';
    let indiceCodigo = -1;
    
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^([A-Za-z])(\d+)$/);
        if (match) {
            codigoEncontrado = match[1].toUpperCase() + match[2];
            indiceCodigo = i;
            break;
        }
    }
    
    if (!codigoEncontrado) {
        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(/([A-Za-z])(\d+)/);
            if (match) {
                codigoEncontrado = match[1].toUpperCase() + match[2];
                indiceCodigo = i;
                break;
            }
        }
    }
    
    if (codigoEncontrado) {
        resultado.codigo = codigoEncontrado;
        lines.splice(indiceCodigo, 1);
    }
    
    // 2. BUSCAR NOMBRE
    if (lines.length > 0) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.match(/^\d{7,10}$/) && 
                !line.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/) &&
                !line.toLowerCase().includes('media luna') &&
                !line.includes(':') &&
                line.length > 2) {
                resultado.nombre = line;
                lines.splice(i, 1);
                break;
            }
        }
        
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
    
    // 3. BUSCAR CELULAR
    for (let i = 0; i < lines.length; i++) {
        const clean = lines[i].replace(/\s/g, '');
        if (clean.match(/^\d{7,10}$/)) {
            resultado.celular = clean;
            lines.splice(i, 1);
            break;
        }
    }
    
    // 4. BUSCAR DETALLE
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes('detalle') || line.toLowerCase().includes('det:')) {
            const parts = line.split(/detalle:?|det:/i);
            resultado.detalle = parts.length > 1 ? parts[1].trim() : line;
            lines.splice(i, 1);
            break;
        }
    }
    
    if (!resultado.detalle) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/) && 
                !line.toLowerCase().includes('media luna') &&
                !line.match(/^\d{7,10}$/) &&
                line.length > 2) {
                resultado.detalle = line;
                lines.splice(i, 1);
                break;
            }
        }
    }
    
    // 5. BUSCAR FECHA
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
        if (match) {
            resultado.fecha = match[1];
            lines.splice(i, 1);
            break;
        }
    }
    
    // 6. BUSCAR TIENDA
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('media luna')) {
            resultado.tienda = 'MEDIA LUNA';
            lines.splice(i, 1);
            break;
        }
    }
    
    return resultado;
}

// ===== PREPROCESAMIENTO DE IMAGEN =====
function preprocesarImagen(canvas, escala) {
    escala = escala || OCR_CONFIG.escala;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        let gray = 0.299 * r + 0.587 * g + 0.114 * b;
        gray = Math.max(0, Math.min(255, (gray - 128) * 1.3 + 128));
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
    }
    ctx.putImageData(imageData, 0, 0);
    
    const scaledCanvas = document.createElement('canvas');
    const scaledCtx = scaledCanvas.getContext('2d');
    const newWidth = canvas.width * escala;
    const newHeight = canvas.height * escala;
    scaledCanvas.width = newWidth;
    scaledCanvas.height = newHeight;
    scaledCtx.imageSmoothingEnabled = true;
    scaledCtx.drawImage(canvas, 0, 0, newWidth, newHeight);
    
    return scaledCanvas;
}

// ===== PROCESAR OCR =====
async function procesarOCR() {
    if (ocrProcesando) return;
    if (!videoElement || !videoElement.videoWidth) return;
    if (!canvasElement) return;
    if (!ocrWorker) {
        try {
            ocrWorker = await Tesseract.createWorker(OCR_CONFIG.idioma);
            console.log('✅ Worker de OCR iniciado');
        } catch (e) {
            console.error('❌ Error al crear worker:', e);
            mostrarToast('❌ Error al iniciar OCR', 'error');
            return;
        }
    }
    
    ocrProcesando = true;
    ocrIntentos++;
    
    try {
        const ctx = canvasElement.getContext('2d');
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
        ctx.drawImage(videoElement, 0, 0);
        
        const processedCanvas = preprocesarImagen(canvasElement);
        
        const result = await ocrWorker.recognize(processedCanvas);
        const text = result.data.text || '';
        const confidence = result.data.confidence || 0;
        
        console.log('📝 Texto OCR:', text);
        console.log('📊 Confianza:', confidence);
        
        const ocrStatusText = document.getElementById('ocrStatusText');
        const ocrConfidence = document.getElementById('ocrConfidence');
        if (ocrConfidence) {
            ocrConfidence.textContent = 'Confianza: ' + Math.round(confidence) + '%';
        }
        
        const datos = parseTicketData(text);
        console.log('📊 Datos parseados:', datos);
        
        if (datos.codigo && datos.nombre) {
            if (datos.codigo === ultimoCodigoValido) {
                contadorCodigoValido++;
            } else {
                ultimoCodigoValido = datos.codigo;
                contadorCodigoValido = 1;
            }
            
            if (contadorCodigoValido >= 2 || confidence > 60) {
                console.log('✅ Ticket válido!');
                ultimoCodigoEscaneado = datos.codigo;
                datosEscaneados = datos;
                detenerOcr();
                detenerScanner();
                
                const ultimoElement = document.getElementById('ultimoCodigoEscaner');
                if (ultimoElement) {
                    ultimoElement.textContent = 'Último: ' + datos.codigo;
                }
                
                const paqueteExistente = DB.getPaqueteByCodigo(datos.codigo);
                
                if (modoScanner === 'registro') {
                    if (paqueteExistente) {
                        mostrarToast('⚠️ El código ' + datos.codigo + ' ya está registrado', 'warning');
                        cambiarModoScanner('consulta');
                        mostrarPaqueteEscaneado(paqueteExistente);
                        const formRapido = document.getElementById('formularioRapido');
                        if (formRapido) formRapido.classList.add('hidden');
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
                            mostrarToast('✅ Paquete ' + datos.codigo + ' registrado para ' + datos.nombre, 'success');
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
                    if (paqueteExistente) {
                        mostrarPaqueteEscaneado(paqueteExistente);
                        const formRapido = document.getElementById('formularioRapido');
                        if (formRapido) formRapido.classList.add('hidden');
                        mostrarToast('📦 Paquete ' + datos.codigo + ' encontrado', 'success');
                    } else {
                        mostrarToast('❌ Paquete ' + datos.codigo + ' no encontrado', 'error');
                        const formRapido = document.getElementById('formularioRapido');
                        if (formRapido) formRapido.classList.remove('hidden');
                        const paqCodigo = document.getElementById('paqCodigo');
                        const paqNombre = document.getElementById('paqNombre');
                        const paqCelular = document.getElementById('paqCelular');
                        const paqDetalle = document.getElementById('paqDetalle');
                        const paqQuienDejo = document.getElementById('paqQuienDejo');
                        if (paqCodigo) paqCodigo.value = datos.codigo;
                        if (paqNombre) paqNombre.value = datos.nombre;
                        if (paqCelular) paqCelular.value = datos.celular || '';
                        if (paqDetalle) paqDetalle.value = datos.detalle || '';
                        if (paqQuienDejo) paqQuienDejo.value = '';
                        const resultDiv = document.getElementById('scannerResult');
                        if (resultDiv) {
                            resultDiv.classList.add('hidden');
                            resultDiv.style.display = 'none';
                        }
                    }
                }
                
                ocrProcesando = false;
                return;
            }
        }
        
        if (ocrStatusText) {
            if (datos.codigo && !datos.nombre) {
                ocrStatusText.textContent = '📷 Código: ' + datos.codigo + ' - Buscando nombre...';
            } else if (!datos.codigo) {
                ocrStatusText.textContent = '📷 Buscando código... Acerca el ticket';
            } else if (datos.codigo && datos.nombre) {
                ocrStatusText.textContent = '✅ ' + datos.codigo + ' - ' + datos.nombre;
            }
        }
        
        if (ocrIntentos < OCR_CONFIG.maxIntentos) {
            console.log('🔄 Reintentando... (' + ocrIntentos + '/' + OCR_CONFIG.maxIntentos + ')');
        } else {
            mostrarToast('⚠️ No se pudo leer el ticket. Acércate y mejora la iluminación.', 'warning');
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
    
    setTimeout(procesarOCR, 500);
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
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };
        
        videoStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement = document.createElement('video');
        videoElement.srcObject = videoStream;
        videoElement.setAttribute('playsinline', '');
        videoElement.onloadedmetadata = function() {
            videoElement.play();
            console.log('📷 Cámara iniciada: ' + videoElement.videoWidth + 'x' + videoElement.videoHeight);
            
            canvasElement = document.createElement('canvas');
            
            const guide = document.getElementById('scannerGuide');
            if (guide) guide.style.display = 'block';
            
            const container = document.getElementById('scannerContainer');
            if (container) container.classList.remove('hidden');
            
            setTimeout(iniciarOcr, 500);
        };
        
        const container = document.getElementById('scannerContainer');
        if (container) {
            container.innerHTML = '';
            container.appendChild(videoElement);
            container.style.position = 'relative';
            
            // Reagregar guía y estado
            const guide = document.createElement('div');
            guide.id = 'scannerGuide';
            guide.style.cssText = 'display:none;position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
            guide.innerHTML = `
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:75%;max-width:350px;height:55%;border:3px dashed rgba(255,255,255,0.5);border-radius:16px;box-shadow:0 0 40px rgba(108,92,231,0.15);">
                    <div style="position:absolute;top:-3px;left:-3px;width:25px;height:25px;border-top:4px solid #6C5CE7;border-left:4px solid #6C5CE7;border-radius:4px 0 0 0;"></div>
                    <div style="position:absolute;top:-3px;right:-3px;width:25px;height:25px;border-top:4px solid #6C5CE7;border-right:4px solid #6C5CE7;border-radius:0 4px 0 0;"></div>
                    <div style="position:absolute;bottom:-3px;left:-3px;width:25px;height:25px;border-bottom:4px solid #6C5CE7;border-left:4px solid #6C5CE7;border-radius:0 0 0 4px;"></div>
                    <div style="position:absolute;bottom:-3px;right:-3px;width:25px;height:25px;border-bottom:4px solid #6C5CE7;border-right:4px solid #6C5CE7;border-radius:0 0 4px 0;"></div>
                    <div style="position:absolute;bottom:15%;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.8);font-size:13px;text-align:center;text-shadow:0 2px 10px rgba(0,0,0,0.7);background:rgba(0,0,0,0.5);padding:6px 16px;border-radius:20px;white-space:nowrap;">📄 Coloca el ticket dentro del recuadro</div>
                    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:rgba(255,255,255,0.08);font-size:48px;">📷</div>
                </div>
            `;
            container.appendChild(guide);
            
            const status = document.createElement('div');
            status.id = 'ocrStatus';
            status.style.cssText = 'display:none;position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:white;padding:8px 20px;border-radius:20px;font-size:13px;z-index:10;text-align:center;backdrop-filter:blur(4px);white-space:nowrap;';
            status.innerHTML = `<span id="ocrStatusText">🔎 Leyendo ticket...</span><span id="ocrConfidence" style="margin-left:12px;font-size:11px;opacity:0.7;">Confianza: --</span>`;
            container.appendChild(status);
        }
        
        return true;
    } catch (error) {
        console.error('❌ Error al iniciar cámara:', error);
        mostrarToast('❌ No se pudo acceder a la cámara: ' + error.message, 'error');
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
    
    const guide = document.getElementById('scannerGuide');
    if (guide) guide.style.display = 'none';
    
    const container = document.getElementById('scannerContainer');
    if (container) container.classList.add('hidden');
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
    const guide = document.getElementById('scannerGuide');
    
    if (btnIniciar) btnIniciar.classList.add('hidden');
    if (btnDetener) btnDetener.classList.remove('hidden');
    if (resultDiv) {
        resultDiv.classList.add('hidden');
        resultDiv.style.display = 'none';
    }
    if (formRapido) formRapido.classList.add('hidden');
    if (guide) guide.style.display = 'block';
    
    iniciarCamara().then(success => {
        if (success) {
            scannerActivo = true;
            mostrarToast('📷 Cámara activada - Modo ' + (modoScanner === 'registro' ? 'REGISTRO' : 'CONSULTA'), 'success');
            console.log('✅ Scanner iniciado correctamente');
        } else {
            if (btnIniciar) btnIniciar.classList.remove('hidden');
            if (btnDetener) btnDetener.classList.add('hidden');
            if (guide) guide.style.display = 'none';
            scannerActivo = false;
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
    const guide = document.getElementById('scannerGuide');
    const container = document.getElementById('scannerContainer');
    const status = document.getElementById('ocrStatus');
    
    if (btnIniciar) btnIniciar.classList.remove('hidden');
    if (btnDetener) btnDetener.classList.add('hidden');
    if (guide) guide.style.display = 'none';
    if (container) container.classList.add('hidden');
    if (status) status.style.display = 'none';
    
    if (ocrWorker) {
        try {
            ocrWorker.terminate();
        } catch(e) {}
        ocrWorker = null;
    }
    
    console.log('⏹ Scanner detenido');
}

// ===== FORZAR ESCÁNER =====
function forzarScanner() {
    mostrarToast('🔄 Reiniciando escáner...', 'warning');
    detenerScanner();
    setTimeout(function() {
        iniciarScanner();
    }, 800);
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
    setTimeout(function() {
        iniciarScanner();
    }, 500);
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
        setTimeout(function() {
            iniciarScanner();
        }, 500);
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
    
    const estadoDisplay = {
        'pendiente': '⏳ Pendiente',
        'entregado': '✅ Entregado'
    }[paquete.estado] || paquete.estado;
    
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
        <p><strong>👤 Quien lo dejó:</strong> ${paquete.quienDejo || 'No especificado'}</p>
        <p><strong>📅 Fecha ingreso:</strong> ${paquete.fechaIngreso}</p>
        ${paquete.fechaTicket ? `<p><strong>📅 Fecha ticket:</strong> ${paquete.fechaTicket}</p>` : ''}
        <p><strong>📅 Días almacenado:</strong> ${dias} días</p>
        <p><strong>💰 Precio base:</strong> ${moneda} ${precioBase}</p>
        ${tieneRecargo ? `<p><strong>📈 Recargo:</strong> ${moneda} ${(diasExtra * recargo).toFixed(2)} (${diasExtra} días extra)</p>` : '<p><strong>📈 Recargo:</strong> Sin recargo</p>'}
        <p><strong>💰 Deuda total:</strong> <span style="font-size:20px;font-weight:bold;color:${deuda > precioBase ? '#E17055' : '#00B894'};">${moneda} ${deuda}</span></p>
        <p><strong>📊 Estado:</strong> <span class="badge ${badgeClass}">${estadoDisplay}</span></p>
        <p><strong>💳 Pagado:</strong> ${paquete.pagado ? '✅ Sí' : '❌ No'}</p>
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
        btnEntregar.textContent = paquete.estado === 'pendiente' ? '✅ Marcar Entregado' : '✅ Ya Entregado';
    }
    if (btnEliminar) {
        btnEliminar.style.display = modoScanner === 'consulta' ? 'inline-flex' : 'none';
    }
    
    const formRapido = document.getElementById('formularioRapido');
    if (formRapido) formRapido.classList.add('hidden');
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
        mostrarToast('⚠️ Código y nombre son obligatorios', 'error');
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
    mostrarToast('✅ Paquete ' + codigo + ' guardado para ' + nombre, 'success');
    
    const formRapido = document.getElementById('formularioRapido');
    const resultDiv = document.getElementById('scannerResult');
    
    if (formRapido) formRapido.classList.add('hidden');
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
        mostrarToast('✅ Este paquete ya fue entregado', 'success');
        return;
    }
    const deuda = DB.calcularDeuda(paquete);
    const moneda = DB.getConfiguracion().moneda || 'Bs';
    if (confirm('¿Marcar paquete ' + paquete.codigo + ' como ENTREGADO?\nDeuda: ' + moneda + ' ' + deuda)) {
        DB.marcarEntregado(paquete.id);
        mostrarToast('✅ Paquete ' + paquete.codigo + ' entregado', 'success');
        const paqueteActualizado = DB.getPaqueteByCodigo(ultimoCodigoEscaneado);
        mostrarPaqueteEscaneado(paqueteActualizado);
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
    if (confirm('¿Eliminar paquete ' + paquete.codigo + '? Esta acción no se puede deshacer.')) {
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
    const codigoInput = document.getElementById('codigoManual');
    if (!codigoInput) return;
    
    let codigo = codigoInput.value.trim().toUpperCase();
    if (!codigo) {
        mostrarToast('⚠️ Ingresa un código', 'warning');
        codigoInput.focus();
        return;
    }
    const match = codigo.match(/^([A-Z])(\d+)$/);
    if (!match) {
        mostrarToast('⚠️ Formato inválido. Ej: A1, B25, Z999', 'error');
        codigoInput.focus();
        return;
    }
    ultimoCodigoEscaneado = codigo;
    const ultimoElement = document.getElementById('ultimoCodigoEscaner');
    if (ultimoElement) ultimoElement.textContent = 'Último: ' + codigo;
    
    const paquete = DB.getPaqueteByCodigo(codigo);
    if (paquete) {
        cambiarModoScanner('consulta');
        mostrarPaqueteEscaneado(paquete);
        const formRapido = document.getElementById('formularioRapido');
        if (formRapido) formRapido.classList.add('hidden');
        if (scannerActivo) detenerScanner();
    } else {
        cambiarModoScanner('registro');
        const formRapido = document.getElementById('formularioRapido');
        if (formRapido) formRapido.classList.remove('hidden');
        const paqCodigo = document.getElementById('paqCodigo');
        const paqNombre = document.getElementById('paqNombre');
        const paqCelular = document.getElementById('paqCelular');
        const paqDetalle = document.getElementById('paqDetalle');
        const paqQuienDejo = document.getElementById('paqQuienDejo');
        if (paqCodigo) paqCodigo.value = codigo;
        if (paqNombre) paqNombre.value = '';
        if (paqCelular) paqCelular.value = '';
        if (paqDetalle) paqDetalle.value = '';
        if (paqQuienDejo) paqQuienDejo.value = '';
        const resultDiv = document.getElementById('scannerResult');
        if (resultDiv) {
            resultDiv.classList.add('hidden');
            resultDiv.style.display = 'none';
        }
        if (scannerActivo) detenerScanner();
    }
    codigoInput.value = '';
}

// ===== CANCELAR FORMULARIO =====
function cancelarFormulario() {
    const formRapido = document.getElementById('formularioRapido');
    if (formRapido) formRapido.classList.add('hidden');
    reiniciarScanner();
}

// ===== EXPORTAR FUNCIONES =====
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

// ===== EXPORTAR CON PREFIJO _ PARA APP.JS =====
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