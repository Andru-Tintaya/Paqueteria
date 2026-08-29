// ===== ESCÁNER QR (BAJO DEMANDA) =====

let scannerInstance = null;
let scannerActivo = false;
let ultimoCodigoEscaneado = null;

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
            fps: 10,
            qrbox: { width: 250, height: 250 },
            formatsToSupport: [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39
            ]
        };

        scannerInstance.start({ facingMode: "environment" }, config, onScanSuccess, onScanError)
            .then(() => {
                scannerActivo = true;
                btnIniciar.classList.add('hidden');
                btnDetener.classList.remove('hidden');
                document.getElementById('scannerResult').classList.add('hidden');
                document.getElementById('scannerResult').style.display = 'none';
                mostrarToast('📷 Cámara activada', 'success');
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
    detenerScanner();
    ultimoCodigoEscaneado = decodedText;

    const paquete = DB.getPaqueteByCodigo(decodedText);
    if (paquete) {
        mostrarPaqueteEscaneado(paquete);
    } else {
        mostrarToast('❌ Paquete no encontrado: ' + decodedText, 'error');
        setTimeout(() => {
            reiniciarScanner();
        }, 2500);
    }
}

function onScanError(error) {
    if (error && error.includes('permission')) {
        console.warn('⚠️ Error de permisos:', error);
    }
}

function mostrarPaqueteEscaneado(paquete) {
    const clientes = DB.getClientes();
    const cliente = clientes.find(c => c.id === paquete.clienteId);
    const deuda = DB.calcularDeuda(paquete);
    const dias = DB.calcularDias(paquete.fechaIngreso);
    const config = DB.getConfiguracion();
    const moneda = config.moneda || 'Bs';

    const infoDiv = document.getElementById('paqueteInfo');
    infoDiv.innerHTML = `
        <p><strong>Código:</strong> ${paquete.codigo}</p>
        <p><strong>Cliente:</strong> ${cliente ? cliente.nombre : 'Desconocido'}</p>
        <p><strong>Celular:</strong> ${cliente ? cliente.celular : 'N/A'}</p>
        <p><strong>Días almacenado:</strong> ${dias}</p>
        <p><strong>Deuda:</strong> <span style="font-weight:700;color:${deuda > config.precioBase ? '#E17055' : '#00B894'};">${moneda} ${deuda}</span></p>
        <p><strong>Pagado:</strong> ${paquete.pagado ? '✅ Sí' : '❌ No'}</p>
        <p><strong>Estado:</strong> <span class="badge ${paquete.estado === 'entregado' ? 'badge-entregado' : paquete.estado === 'pago_pendiente' ? 'badge-warning' : 'badge-pendiente'}">${paquete.estado === 'pendiente' ? '⏳ Pendiente' : paquete.estado === 'pago_pendiente' ? '💰 Pago Pendiente' : '✅ Entregado'}</span></p>
    `;

    const resultDiv = document.getElementById('scannerResult');
    resultDiv.classList.remove('hidden');
    resultDiv.style.display = 'block';

    const btnEntregar = document.querySelector('.scanner-actions .btn-success');
    const btnPagar = document.querySelector('.scanner-actions .btn-warning');

    if (btnEntregar) {
        btnEntregar.style.display = paquete.estado !== 'entregado' ? 'inline-flex' : 'none';
    }
    if (btnPagar) {
        btnPagar.style.display = !paquete.pagado && paquete.estado !== 'entregado' ? 'inline-flex' : 'none';
    }

    actualizarBadge();
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

function marcarPagoDesdeScanner() {
    if (!ultimoCodigoEscaneado) {
        mostrarToast('⚠️ No hay paquete escaneado', 'warning');
        return;
    }

    const paquete = DB.getPaqueteByCodigo(ultimoCodigoEscaneado);
    if (!paquete) {
        mostrarToast('❌ Paquete no encontrado', 'error');
        return;
    }

    if (paquete.pagado) {
        mostrarToast('💰 Este paquete ya fue pagado', 'success');
        return;
    }

    const deuda = DB.calcularDeuda(paquete);
    const moneda = DB.getConfiguracion().moneda || 'Bs';
    if (confirm(`¿Registrar pago de ${moneda} ${deuda} para el paquete ${paquete.codigo}?`)) {
        DB.marcarPago(paquete.id);
        mostrarToast(`💰 Pago de ${moneda} ${deuda} registrado`, 'success');
        mostrarPaqueteEscaneado(DB.getPaqueteByCodigo(ultimoCodigoEscaneado));
        actualizarDashboard();
        actualizarListas();
        actualizarBadge();
    }
}

function reiniciarScanner() {
    ultimoCodigoEscaneado = null;
    const resultDiv = document.getElementById('scannerResult');
    resultDiv.classList.add('hidden');
    resultDiv.style.display = 'none';
}

function buscarPorCodigo() {
    const codigo = document.getElementById('codigoManual').value.trim();
    if (!codigo) {
        mostrarToast('⚠️ Ingresa un código', 'warning');
        return;
    }

    const paquete = DB.getPaqueteByCodigo(codigo);
    if (paquete) {
        ultimoCodigoEscaneado = codigo;
        if (scannerActivo) detenerScanner();
        mostrarPaqueteEscaneado(paquete);
    } else {
        mostrarToast('❌ Paquete no encontrado', 'error');
    }
}

document.addEventListener('pageChange', function(e) {
    if (e.detail && e.detail.page !== 'escaner') {
        if (scannerActivo) {
            detenerScanner();
        }
    }
});