// ===== ESCÁNER QR (PRIMORDIAL) =====

let scannerInstance = null;
let scannerActivo = false;
let ultimoCodigoEscaneado = null;
let datosEscaneados = null;

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
                mostrarToast('📷 Cámara activada - Escanea el código del ticket', 'success');
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

function onScanSuccess(decodedText, decodedResult) {
    console.log('📷 Código escaneado:', decodedText);
    
    // Detener scanner automáticamente
    detenerScanner();
    
    // Limpiar el texto escaneado (quitar espacios, saltos de línea)
    let codigo = decodedText.trim().replace(/\s/g, '');
    // Si es muy largo, solo tomar la primera parte (por si tiene más texto)
    if (codigo.length > 6) {
        // Buscar formato de código (letra + número)
        const match = codigo.match(/^([A-Za-z])(\d+)/);
        if (match) {
            codigo = match[1].toUpperCase() + match[2];
        } else {
            // Si no coincide, usar los primeros 4 caracteres
            codigo = codigo.substring(0, 4).toUpperCase();
        }
    }
    
    ultimoCodigoEscaneado = codigo;
    document.getElementById('ultimoCodigoEscaner').textContent = `Último: ${codigo}`;
    
    // Buscar si el paquete ya existe
    const paqueteExistente = DB.getPaqueteByCodigo(codigo);
    
    if (paqueteExistente) {
        // Si existe, mostrar información
        mostrarPaqueteEscaneado(paqueteExistente);
        document.getElementById('formularioRapido').classList.add('hidden');
    } else {
        // Si no existe, mostrar formulario para completar datos
        mostrarFormularioRapido(codigo);
        document.getElementById('scannerResult').classList.add('hidden');
        document.getElementById('scannerResult').style.display = 'none';
    }
    
    mostrarToast(`📷 Código escaneado: ${codigo}`, 'success');
}

function onScanError(error) {
    if (error && error.includes('permission')) {
        console.warn('⚠️ Error de permisos:', error);
    }
}

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
    
    const paquete = {
        codigo: codigo,
        clienteNombre: nombre,
        clienteCelular: celular || '',
        detalle: detalle || '',
        quienDejo: quienDejo || '',
        fechaIngreso: new Date().toISOString().split('T')[0],
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

function cancelarFormulario() {
    document.getElementById('formularioRapido').classList.add('hidden');
    reiniciarScanner();
}

function mostrarPaqueteEscaneado(paquete) {
    const clientes = DB.getClientes();
    const infoDiv = document.getElementById('paqueteInfo');
    
    const estadoDisplay = {
        'pendiente': '⏳ Pendiente',
        'entregado': '✅ Entregado'
    }[paquete.estado] || paquete.estado;
    
    const badgeClass = {
        'pendiente': 'badge-pendiente',
        'entregado': 'badge-entregado'
    }[paquete.estado] || '';
    
    infoDiv.innerHTML = `
        <p><strong>📌 Código:</strong> <span style="font-size:20px;font-weight:bold;color:#6C5CE7;">${paquete.codigo}</span></p>
        <p><strong>👤 Cliente:</strong> ${paquete.clienteNombre}</p>
        <p><strong>📱 Celular:</strong> ${paquete.clienteCelular || 'N/A'}</p>
        <p><strong>📝 Detalle:</strong> ${paquete.detalle || 'Sin detalle'}</p>
        <p><strong>👤 Quien lo dejó:</strong> ${paquete.quienDejo || 'No especificado'}</p>
        <p><strong>📅 Fecha:</strong> ${paquete.fechaIngreso}</p>
        <p><strong>📊 Estado:</strong> <span class="badge ${badgeClass}">${estadoDisplay}</span></p>
    `;
    
    const resultDiv = document.getElementById('scannerResult');
    resultDiv.classList.remove('hidden');
    resultDiv.style.display = 'block';
    
    // Mostrar/ocultar botones según estado
    const btnGuardar = document.querySelector('.scanner-actions .btn-success');
    const btnEntregar = document.querySelector('.scanner-actions .btn-warning');
    
    if (btnGuardar) {
        btnGuardar.style.display = 'none';
    }
    if (btnEntregar) {
        btnEntregar.style.display = paquete.estado === 'pendiente' ? 'inline-flex' : 'none';
        btnEntregar.textContent = paquete.estado === 'pendiente' ? '✅ Marcar Entregado' : '✅ Ya Entregado';
    }
    
    document.getElementById('formularioRapido').classList.add('hidden');
}

function guardarDesdeScanner() {
    // Esta función se usa cuando se escanea un código nuevo
    // El formulario ya maneja el guardado
    document.getElementById('paqueteForm').dispatchEvent(new Event('submit'));
}

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
    
    if (confirm(`¿Marcar paquete ${paquete.codigo} como ENTREGADO?`)) {
        DB.marcarEntregado(paquete.id);
        mostrarToast(`✅ Paquete ${paquete.codigo} entregado`, 'success');
        mostrarPaqueteEscaneado(DB.getPaqueteByCodigo(ultimoCodigoEscaneado));
        actualizarDashboard();
        actualizarListas();
        actualizarBadge();
    }
}

function reiniciarScanner() {
    ultimoCodigoEscaneado = null;
    document.getElementById('scannerResult').classList.add('hidden');
    document.getElementById('scannerResult').style.display = 'none';
    document.getElementById('formularioRapido').classList.add('hidden');
    if (!scannerActivo) {
        iniciarScanner();
    }
}

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