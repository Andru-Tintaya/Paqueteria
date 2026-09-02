// ===== ESCÁNER QR (CORREGIDO - SIN RECURSIÓN) =====

let scannerInstance = null;
let scannerActivo = false;
let ultimoCodigoEscaneado = null;
let datosEscaneados = null;
let modoScanner = 'registro'; // 'registro' o 'consulta'
let intentosReconexion = 0;

// ===== FUNCIÓN PARA PARSEAR EL CONTENIDO DEL TICKET =====
function parseTicketData(decodedText) {
    const lines = decodedText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let resultado = {
        codigo: '',
        nombre: '',
        celular: '',
        detalle: '',
        fecha: '',
        tienda: ''
    };
    
    if (lines.length === 0) return resultado;
    
    // Buscar código (letra + número)
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^([A-Za-z])(\d+)$/);
        if (match) {
            resultado.codigo = lines[i].toUpperCase();
            lines.splice(i, 1);
            break;
        }
    }
    
    if (!resultado.codigo && lines.length > 0) {
        const first = lines[0];
        const match = first.match(/^([A-Za-z])(\d+)/);
        if (match) {
            resultado.codigo = match[1].toUpperCase() + match[2];
            lines.splice(0, 1);
        }
    }
    
    // Buscar nombre
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.match(/^\d{7,10}$/) && 
            !line.includes(':') && 
            line.toLowerCase() !== 'media luna' &&
            line.length > 2) {
            resultado.nombre = line;
            lines.splice(i, 1);
            break;
        }
    }
    
    // Buscar celular
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].replace(/\s/g, '');
        if (line.match(/^\d{7,10}$/)) {
            resultado.celular = line;
            lines.splice(i, 1);
            break;
        }
    }
    
    // Buscar detalle
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes('detalle')) {
            const detalleParts = line.split(':');
            resultado.detalle = detalleParts.length > 1 ? detalleParts.slice(1).join(':').trim() : line;
            lines.splice(i, 1);
            break;
        }
    }
    
    if (!resultado.detalle) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.includes('/') && 
                line.toLowerCase() !== 'media luna' && 
                !line.match(/^\d{7,10}$/)) {
                resultado.detalle = line;
                lines.splice(i, 1);
                break;
            }
        }
    }
    
    // Buscar fecha
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/\d{1,2}\/\d{1,2}\/\d{2,4}/)) {
            resultado.fecha = lines[i];
            lines.splice(i, 1);
            break;
        }
    }
    
    // Buscar tienda
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('media luna') || lines[i].toLowerCase().includes('medialuna')) {
            resultado.tienda = 'MEDIA LUNA';
            lines.splice(i, 1);
            break;
        }
    }
    
    return resultado;
}

// ===== CAMBIAR MODO DEL ESCÁNER (CORREGIDO - SIN RECURSIÓN) =====
function cambiarModoScanner(modo) {
    modoScanner = modo;
    const btnRegistro = document.getElementById('modoRegistro');
    const btnConsulta = document.getElementById('modoConsulta');
    
    if (btnRegistro && btnConsulta) {
        if (modo === 'registro') {
            btnRegistro.className = 'btn-primary';
            btnConsulta.className = 'btn-secondary';
            document.getElementById('modoRegistroLabel').textContent = '📝 Modo Registro';
            document.getElementById('modoConsultaLabel').textContent = '🔍 Modo Consulta';
            document.getElementById('modoDescripcion').textContent = '📝 Registro: Guarda automáticamente tickets nuevos';
        } else {
            btnConsulta.className = 'btn-primary';
            btnRegistro.className = 'btn-secondary';
            document.getElementById('modoRegistroLabel').textContent = '📝 Registro';
            document.getElementById('modoConsultaLabel').textContent = '🔍 Modo Consulta';
            document.getElementById('modoDescripcion').textContent = '🔍 Consulta: Busca y muestra detalles de paquetes existentes';
        }
    }
    
    mostrarToast(`📷 Modo: ${modo === 'registro' ? 'Registro' : 'Consulta'}`, 'success');
    
    // Si el scanner está activo, reiniciarlo para aplicar el modo
    if (scannerActivo) {
        detenerScanner();
        setTimeout(function() {
            iniciarScanner();
        }, 500);
    }
}

// ===== FORZAR ESCÁNER (NUEVO) =====
function forzarScanner() {
    mostrarToast('🔄 Reiniciando escáner...', 'warning');
    
    // Detener completamente
    if (scannerInstance && scannerActivo) {
        try {
            scannerInstance.stop();
        } catch(e) {}
        scannerInstance = null;
        scannerActivo = false;
    }
    
    // Limpiar UI
    document.getElementById('scannerContainer').classList.add('hidden');
    document.getElementById('btnIniciarScanner').classList.remove('hidden');
    document.getElementById('btnDetenerScanner').classList.add('hidden');
    document.getElementById('scannerResult').classList.add('hidden');
    document.getElementById('scannerResult').style.display = 'none';
    document.getElementById('formularioRapido').classList.add('hidden');
    
    // Esperar y reiniciar
    setTimeout(function() {
        iniciarScanner();
    }, 800);
}

// ===== INICIAR ESCÁNER =====
function iniciarScanner() {
    const container = document.getElementById('scannerContainer');
    const btnIniciar = document.getElementById('btnIniciarScanner');
    const btnDetener = document.getElementById('btnDetenerScanner');

    if (!container) {
        console.error('❌ Contenedor del escáner no encontrado');
        return;
    }

    // Verificar soporte de cámara
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        mostrarToast('⚠️ Tu navegador no soporta cámara. Usa búsqueda manual.', 'error');
        return;
    }

    if (scannerActivo) {
        mostrarToast('⚠️ El escáner ya está activo', 'warning');
        return;
    }

    // Mostrar contenedor
    container.classList.remove('hidden');

    try {
        if (typeof Html5Qrcode === 'undefined') {
            mostrarToast('❌ Librería de escáner no cargada', 'error');
            container.classList.add('hidden');
            return;
        }

        // Limpiar instancia anterior
        if (scannerInstance) {
            try {
                scannerInstance.clear();
            } catch(e) {
                console.warn('Error al limpiar scanner:', e);
            }
            scannerInstance = null;
        }

        // Crear nueva instancia
        scannerInstance = new Html5Qrcode("reader", {
            verbose: false
        });

        const config = {
            fps: 20,
            qrbox: { width: 260, height: 260 },
            formatsToSupport: [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39
            ]
        };

        scannerInstance.start(
            { facingMode: "environment" },
            config,
            function(decodedText, decodedResult) {
                // Éxito al escanear
                onScanSuccess(decodedText, decodedResult);
            },
            function(error) {
                // Error de escaneo (silenciar)
                if (error && error.includes('permission')) {
                    console.warn('⚠️ Error de permisos:', error);
                }
            }
        ).then(function() {
            scannerActivo = true;
            btnIniciar.classList.add('hidden');
            btnDetener.classList.remove('hidden');
            document.getElementById('scannerResult').classList.add('hidden');
            document.getElementById('scannerResult').style.display = 'none';
            document.getElementById('formularioRapido').classList.add('hidden');
            intentosReconexion = 0;
            const modoTexto = modoScanner === 'registro' ? 'REGISTRO' : 'CONSULTA';
            mostrarToast(`📷 Cámara activada - Modo ${modoTexto}`, 'success');
            console.log('✅ Scanner iniciado correctamente');
        }).catch(function(err) {
            console.error('❌ Error al iniciar scanner:', err);
            mostrarToast('❌ No se pudo acceder a la cámara: ' + err.message, 'error');
            container.classList.add('hidden');
            btnIniciar.classList.remove('hidden');
            btnDetener.classList.add('hidden');
            scannerActivo = false;
        });
    } catch (error) {
        console.error('❌ Error crítico:', error);
        mostrarToast('❌ Error al iniciar el escáner: ' + error.message, 'error');
        container.classList.add('hidden');
        btnIniciar.classList.remove('hidden');
        btnDetener.classList.add('hidden');
        scannerActivo = false;
    }
}

// ===== DETENER ESCÁNER =====
function detenerScanner() {
    if (scannerInstance && scannerActivo) {
        scannerInstance.stop()
            .then(function() {
                scannerActivo = false;
                document.getElementById('scannerContainer').classList.add('hidden');
                document.getElementById('btnIniciarScanner').classList.remove('hidden');
                document.getElementById('btnDetenerScanner').classList.add('hidden');
                mostrarToast('⏹ Cámara detenida', 'warning');
                console.log('⏹ Scanner detenido');
            })
            .catch(function(err) {
                console.error('Error al detener scanner:', err);
                scannerActivo = false;
                document.getElementById('scannerContainer').classList.add('hidden');
                document.getElementById('btnIniciarScanner').classList.remove('hidden');
                document.getElementById('btnDetenerScanner').classList.add('hidden');
            });
    } else {
        document.getElementById('scannerContainer').classList.add('hidden');
        document.getElementById('btnIniciarScanner').classList.remove('hidden');
        document.getElementById('btnDetenerScanner').classList.add('hidden');
        scannerActivo = false;
    }
}

// ===== ÉXITO AL ESCANEAR =====
function onScanSuccess(decodedText, decodedResult) {
    console.log('📷 Ticket escaneado:', decodedText);
    
    // Detener scanner automáticamente
    detenerScanner();
    
    // Parsear los datos del ticket
    const datos = parseTicketData(decodedText);
    console.log('📊 Datos parseados:', datos);
    
    if (!datos.codigo) {
        mostrarToast('❌ No se pudo leer el código del ticket', 'error');
        setTimeout(function() {
            reiniciarScanner();
        }, 2000);
        return;
    }
    
    ultimoCodigoEscaneado = datos.codigo;
    datosEscaneados = datos;
    document.getElementById('ultimoCodigoEscaner').textContent = 'Último: ' + datos.codigo;
    
    // Verificar si el paquete ya existe
    const paqueteExistente = DB.getPaqueteByCodigo(datos.codigo);
    
    if (modoScanner === 'registro') {
        // ===== MODO REGISTRO =====
        if (paqueteExistente) {
            mostrarToast('⚠️ El código ' + datos.codigo + ' ya está registrado', 'warning');
            cambiarModoScanner('consulta');
            mostrarPaqueteEscaneado(paqueteExistente);
            document.getElementById('formularioRapido').classList.add('hidden');
        } else {
            // ===== GUARDADO AUTOMÁTICO =====
            const config = DB.getConfiguracion();
            const precioBase = config.precioBase || 3;
            
            const nuevoPaquete = {
                codigo: datos.codigo,
                clienteNombre: datos.nombre || 'Cliente sin nombre',
                clienteCelular: datos.celular || '',
                detalle: datos.detalle || '',
                quienDejo: '',
                fechaIngreso: new Date().toISOString().split('T')[0],
                fechaTicket: datos.fecha || '',
                tienda: datos.tienda || 'MEDIA LUNA',
                precioBase: precioBase,
                estado: 'pendiente',
                pagado: false
            };
            
            const guardado = DB.addPaqueteDirecto(nuevoPaquete);
            
            if (guardado) {
                mostrarToast('✅ Paquete ' + datos.codigo + ' registrado para ' + (datos.nombre || 'cliente'), 'success');
                const paqueteGuardado = DB.getPaqueteByCodigo(datos.codigo);
                mostrarPaqueteEscaneado(paqueteGuardado);
                actualizarDashboard();
                actualizarListas();
                actualizarBadge();
            } else {
                mostrarToast('❌ Error al guardar el paquete ' + datos.codigo, 'error');
            }
        }
    } else {
        // ===== MODO CONSULTA =====
        if (paqueteExistente) {
            mostrarPaqueteEscaneado(paqueteExistente);
            document.getElementById('formularioRapido').classList.add('hidden');
            mostrarToast('📦 Paquete ' + datos.codigo + ' encontrado', 'success');
        } else {
            mostrarToast('❌ Paquete ' + datos.codigo + ' no encontrado', 'error');
            document.getElementById('formularioRapido').classList.remove('hidden');
            document.getElementById('paqCodigo').value = datos.codigo;
            document.getElementById('paqNombre').value = datos.nombre || '';
            document.getElementById('paqCelular').value = datos.celular || '';
            document.getElementById('paqDetalle').value = datos.detalle || '';
            document.getElementById('paqQuienDejo').value = '';
            document.getElementById('scannerResult').classList.add('hidden');
            document.getElementById('scannerResult').style.display = 'none';
        }
    }
}

// ===== MOSTRAR PAQUETE ESCANEADO =====
function mostrarPaqueteEscaneado(paquete) {
    const infoDiv = document.getElementById('paqueteInfo');
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
    
    const modoTexto = modoScanner === 'registro' ? '📝 Registro' : '🔍 Consulta';
    
    infoDiv.innerHTML = `
        <div style="text-align:center;margin-bottom:10px;">
            <span style="font-size:16px;font-weight:bold;color:#6C5CE7;">${modoTexto}</span>
        </div>
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
    resultDiv.classList.remove('hidden');
    resultDiv.style.display = 'block';
    
    const btnEntregar = document.getElementById('btnEntregarScanner');
    const btnEliminar = document.getElementById('btnEliminarScanner');
    
    if (btnEntregar) {
        btnEntregar.style.display = (paquete.estado === 'pendiente' && modoScanner === 'consulta') ? 'inline-flex' : 'none';
        btnEntregar.textContent = paquete.estado === 'pendiente' ? '✅ Marcar Entregado' : '✅ Ya Entregado';
    }
    if (btnEliminar) {
        btnEliminar.style.display = modoScanner === 'consulta' ? 'inline-flex' : 'none';
    }
    
    document.getElementById('formularioRapido').classList.add('hidden');
}

// ===== FORMULARIO RÁPIDO =====
function mostrarFormularioRapido(codigo) {
    const formContainer = document.getElementById('formularioRapido');
    formContainer.classList.remove('hidden');
    
    document.getElementById('paqCodigo').value = codigo || '';
    document.getElementById('paqNombre').value = '';
    document.getElementById('paqCelular').value = '';
    document.getElementById('paqDetalle').value = '';
    document.getElementById('paqQuienDejo').value = '';
    
    document.getElementById('paqNombre').focus();
    formContainer.scrollIntoView({ behavior: 'smooth' });
}

// ===== GUARDAR DESDE FORMULARIO RÁPIDO =====
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
    
    document.getElementById('formularioRapido').classList.add('hidden');
    document.getElementById('scannerResult').classList.add('hidden');
    document.getElementById('scannerResult').style.display = 'none';
    
    actualizarDashboard();
    actualizarListas();
    actualizarBadge();
    
    setTimeout(function() {
        if (!scannerActivo) {
            iniciarScanner();
        }
    }, 1000);
}

// ===== CANCELAR FORMULARIO =====
function cancelarFormulario() {
    document.getElementById('formularioRapido').classList.add('hidden');
    reiniciarScanner();
}

// ===== MARCAR ENTREGADO DESDE SCANNER =====
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

// ===== ELIMINAR DESDE SCANNER =====
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

// ===== REINICIAR SCANNER =====
function reiniciarScanner() {
    ultimoCodigoEscaneado = null;
    datosEscaneados = null;
    document.getElementById('scannerResult').classList.add('hidden');
    document.getElementById('scannerResult').style.display = 'none';
    document.getElementById('formularioRapido').classList.add('hidden');
    
    if (scannerInstance) {
        try {
            scannerInstance.clear();
        } catch(e) {}
        scannerInstance = null;
    }
    scannerActivo = false;
    
    setTimeout(function() {
        iniciarScanner();
    }, 500);
}

// ===== BUSCAR POR CÓDIGO MANUAL =====
function buscarPorCodigo() {
    const codigoInput = document.getElementById('codigoManual');
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
    document.getElementById('ultimoCodigoEscaner').textContent = 'Último: ' + codigo;
    
    const paquete = DB.getPaqueteByCodigo(codigo);
    if (paquete) {
        cambiarModoScanner('consulta');
        mostrarPaqueteEscaneado(paquete);
        document.getElementById('formularioRapido').classList.add('hidden');
        if (scannerActivo) detenerScanner();
    } else {
        cambiarModoScanner('registro');
        mostrarFormularioRapido(codigo);
        document.getElementById('scannerResult').classList.add('hidden');
        document.getElementById('scannerResult').style.display = 'none';
        if (scannerActivo) detenerScanner();
    }
    
    codigoInput.value = '';
}

// ===== EVENTO AL CAMBIAR DE PÁGINA =====
document.addEventListener('pageChange', function(e) {
    if (e.detail && e.detail.page !== 'escaner') {
        if (scannerActivo) {
            detenerScanner();
        }
    }
    if (e.detail && e.detail.page === 'escaner') {
        setTimeout(function() {
            if (!scannerActivo) {
                iniciarScanner();
            }
        }, 500);
    }
});

// ===== EXPORTAR FUNCIONES PARA APP.JS =====
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
window._mostrarFormularioRapido = mostrarFormularioRapido;