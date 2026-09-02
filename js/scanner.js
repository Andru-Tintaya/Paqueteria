// ===== ESCÁNER QR (GUARDADO AUTOMÁTICO) =====

let scannerInstance = null;
let scannerActivo = false;
let ultimoCodigoEscaneado = null;
let datosEscaneados = null;

// ===== FUNCIÓN PARA PARSEAR EL CONTENIDO DEL TICKET =====
function parseTicketData(decodedText) {
    // El ticket tiene este formato:
    // A23
    // Mayk Andru Tintaya
    // 77714732
    // detalle:delicado
    // 02/09/2024
    // MEDIA LUNA
    
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
    
    // El código siempre es la primera línea (A1, B25, Z999)
    const codigoMatch = lines[0].match(/^([A-Za-z])(\d+)$/);
    if (codigoMatch) {
        resultado.codigo = lines[0].toUpperCase();
        lines.shift();
    } else {
        // Si no es código, buscar el código en cualquier línea
        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(/^([A-Za-z])(\d+)$/);
            if (match) {
                resultado.codigo = lines[i].toUpperCase();
                lines.splice(i, 1);
                break;
            }
        }
    }
    
    // Buscar nombre (suele ser la segunda línea, que no es código ni número)
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Si no es un número de celular y no tiene ":" y no es "MEDIA LUNA"
        if (!line.match(/^\d{7,10}$/) && 
            !line.includes(':') && 
            line.toLowerCase() !== 'media luna' &&
            line.length > 2) {
            resultado.nombre = line;
            lines.splice(i, 1);
            break;
        }
    }
    
    // Buscar celular (número de 7 a 10 dígitos)
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].replace(/\s/g, '');
        if (line.match(/^\d{7,10}$/)) {
            resultado.celular = line;
            lines.splice(i, 1);
            break;
        }
    }
    
    // Buscar detalle (línea con "detalle:" o "Detalle:")
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes('detalle')) {
            const detalleParts = line.split(':');
            if (detalleParts.length > 1) {
                resultado.detalle = detalleParts.slice(1).join(':').trim();
            } else {
                resultado.detalle = line;
            }
            lines.splice(i, 1);
            break;
        }
    }
    
    // Si no se encontró detalle, usar la siguiente línea que no sea fecha ni tienda
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
    
    // Buscar fecha (formato dd/mm/yyyy o dd/mm/yy)
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/)) {
            resultado.fecha = line;
            lines.splice(i, 1);
            break;
        }
    }
    
    // Buscar tienda (MEDIA LUNA)
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        if (line.includes('media luna') || line.includes('medialuna')) {
            resultado.tienda = 'MEDIA LUNA';
            lines.splice(i, 1);
            break;
        }
    }
    
    // Si no se encontró nombre, usar la primera línea restante
    if (!resultado.nombre && lines.length > 0) {
        resultado.nombre = lines[0];
    }
    
    return resultado;
}

// ===== INICIAR ESCÁNER =====
function iniciarScanner() {
    const container = document.getElementById('scannerContainer');
    const btnIniciar = document.getElementById('btnIniciarScanner');
    const btnDetener = document.getElementById('btnDetenerScanner');

    if (!container) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        mostrarToast('⚠️ Tu navegador no soporta cámara. Usa búsqueda manual.', 'error');
        return;
    }

    if (scannerActivo) return;

    container.classList.remove('hidden');

    try {
        if (typeof Html5Qrcode === 'undefined') {
            mostrarToast('❌ Librería de escáner no cargada', 'error');
            return;
        }

        scannerInstance = new Html5Qrcode("reader");

        const config = {
            fps: 15,
            qrbox: { width: 280, height: 280 },
            formatsToSupport: [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.UPC_A
            ]
        };

        scannerInstance.start({ facingMode: "environment" }, config, onScanSuccess, onScanError)
            .then(() => {
                scannerActivo = true;
                btnIniciar.classList.add('hidden');
                btnDetener.classList.remove('hidden');
                document.getElementById('scannerResult').classList.add('hidden');
                document.getElementById('scannerResult').style.display = 'none';
                document.getElementById('formularioRapido').classList.add('hidden');
                mostrarToast('📷 Cámara activada - Escanea el ticket', 'success');
            })
            .catch(err => {
                console.error('Error al iniciar scanner:', err);
                mostrarToast('❌ No se pudo acceder a la cámara', 'error');
                container.classList.add('hidden');
                btnIniciar.classList.remove('hidden');
                btnDetener.classList.add('hidden');
            });
    } catch (error) {
        console.error('Error:', error);
        mostrarToast('❌ Error al iniciar el escáner', 'error');
        container.classList.add('hidden');
        btnIniciar.classList.remove('hidden');
        btnDetener.classList.add('hidden');
    }
}

// ===== DETENER ESCÁNER =====
function detenerScanner() {
    if (scannerInstance && scannerActivo) {
        scannerInstance.stop()
            .then(() => {
                scannerActivo = false;
                document.getElementById('scannerContainer').classList.add('hidden');
                document.getElementById('btnIniciarScanner').classList.remove('hidden');
                document.getElementById('btnDetenerScanner').classList.add('hidden');
                mostrarToast('⏹ Cámara detenida', 'warning');
            })
            .catch(err => {
                console.error('Error al detener scanner:', err);
                scannerActivo = false;
            });
    } else {
        document.getElementById('scannerContainer').classList.add('hidden');
        document.getElementById('btnIniciarScanner').classList.remove('hidden');
        document.getElementById('btnDetenerScanner').classList.add('hidden');
        scannerActivo = false;
    }
}

// ===== ÉXITO AL ESCANEAR - GUARDADO AUTOMÁTICO =====
function onScanSuccess(decodedText, decodedResult) {
    console.log('📷 Ticket escaneado:', decodedText);
    
    // Detener scanner automáticamente
    detenerScanner();
    
    // Parsear los datos del ticket
    const datos = parseTicketData(decodedText);
    console.log('📊 Datos parseados:', datos);
    
    if (!datos.codigo) {
        mostrarToast('❌ No se pudo leer el código del ticket', 'error');
        setTimeout(() => {
            reiniciarScanner();
        }, 2000);
        return;
    }
    
    ultimoCodigoEscaneado = datos.codigo;
    datosEscaneados = datos;
    document.getElementById('ultimoCodigoEscaner').textContent = `Último: ${datos.codigo}`;
    
    // Verificar si el paquete ya existe
    const paqueteExistente = DB.getPaqueteByCodigo(datos.codigo);
    
    if (paqueteExistente) {
        // Si ya existe, mostrar información
        mostrarPaqueteEscaneado(paqueteExistente);
        document.getElementById('formularioRapido').classList.add('hidden');
        mostrarToast(`📦 Paquete ${datos.codigo} ya está registrado`, 'warning');
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
        
        // Guardar automáticamente
        const guardado = DB.addPaqueteDirecto(nuevoPaquete);
        
        if (guardado) {
            mostrarToast(`✅ Paquete ${datos.codigo} guardado automáticamente para ${datos.nombre || 'cliente'}`, 'success');
            
            // Mostrar el paquete escaneado con toda la información
            const paqueteGuardado = DB.getPaqueteByCodigo(datos.codigo);
            mostrarPaqueteEscaneado(paqueteGuardado);
            
            actualizarDashboard();
            actualizarListas();
            actualizarBadge();
        } else {
            mostrarToast(`❌ Error al guardar el paquete ${datos.codigo}`, 'error');
        }
    }
}

// ===== ERROR AL ESCANEAR =====
function onScanError(error) {
    if (error && error.includes('permission')) {
        console.warn('⚠️ Error de permisos:', error);
    }
}

// ===== MOSTRAR PAQUETE ESCANEADO (CON DEUDA Y PRECIOS) =====
function mostrarPaqueteEscaneado(paquete) {
    const infoDiv = document.getElementById('paqueteInfo');
    const config = DB.getConfiguracion();
    const moneda = config.moneda || 'Bs';
    
    // Calcular deuda y días
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
    resultDiv.classList.remove('hidden');
    resultDiv.style.display = 'block';
    
    // Mostrar/ocultar botones según estado
    const btnEntregar = document.getElementById('btnEntregarScanner');
    const btnEliminar = document.getElementById('btnEliminarScanner');
    
    if (btnEntregar) {
        btnEntregar.style.display = paquete.estado === 'pendiente' ? 'inline-flex' : 'none';
        btnEntregar.textContent = paquete.estado === 'pendiente' ? '✅ Marcar Entregado' : '✅ Ya Entregado';
    }
    if (btnEliminar) {
        btnEliminar.style.display = 'inline-flex';
    }
    
    document.getElementById('formularioRapido').classList.add('hidden');
}

// ===== FORMULARIO RÁPIDO (SOLO SI FALLA EL PARSEO) =====
function mostrarFormularioRapido(codigo) {
    const formContainer = document.getElementById('formularioRapido');
    formContainer.classList.remove('hidden');
    
    document.getElementById('paqCodigo').value = codigo;
    document.getElementById('paqNombre').value = '';
    document.getElementById('paqCelular').value = '';
    document.getElementById('paqDetalle').value = '';
    document.getElementById('paqQuienDejo').value = '';
    
    document.getElementById('paqNombre').focus();
    
    // Scroll al formulario
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
    
    // Verificar si ya existe
    if (DB.getPaqueteByCodigo(codigo)) {
        mostrarToast(`⚠️ El código ${codigo} ya existe`, 'error');
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
    
    mostrarToast(`✅ Paquete ${codigo} guardado para ${nombre}`, 'success');
    
    // Limpiar formulario
    document.getElementById('formularioRapido').classList.add('hidden');
    document.getElementById('scannerResult').classList.add('hidden');
    document.getElementById('scannerResult').style.display = 'none';
    
    actualizarDashboard();
    actualizarListas();
    actualizarBadge();
    
    // Reiniciar scanner
    setTimeout(() => {
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
    
    if (confirm(`¿Marcar paquete ${paquete.codigo} como ENTREGADO?\nDeuda: ${moneda} ${deuda}`)) {
        DB.marcarEntregado(paquete.id);
        mostrarToast(`✅ Paquete ${paquete.codigo} entregado - ${moneda} ${deuda}`, 'success');
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
    
    if (confirm(`¿Eliminar paquete ${paquete.codigo}? Esta acción no se puede deshacer.`)) {
        DB.deletePaquete(paquete.id);
        mostrarToast(`🗑️ Paquete ${paquete.codigo} eliminado`, 'error');
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
    if (!scannerActivo) {
        iniciarScanner();
    }
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
    
    // Validar formato
    const match = codigo.match(/^([A-Z])(\d+)$/);
    if (!match) {
        mostrarToast('⚠️ Formato inválido. Ej: A1, B25, Z999', 'error');
        codigoInput.focus();
        return;
    }
    
    ultimoCodigoEscaneado = codigo;
    document.getElementById('ultimoCodigoEscaner').textContent = `Último: ${codigo}`;
    
    const paquete = DB.getPaqueteByCodigo(codigo);
    if (paquete) {
        mostrarPaqueteEscaneado(paquete);
        document.getElementById('formularioRapido').classList.add('hidden');
        if (scannerActivo) detenerScanner();
    } else {
        // Si no existe, mostrar formulario para crear
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
        setTimeout(() => {
            if (!scannerActivo) {
                iniciarScanner();
            }
        }, 500);
    }
});