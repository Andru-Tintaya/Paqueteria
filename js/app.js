// ===== APP PRINCIPAL =====

let ticketsGenerados = [];
let clienteActual = null;
let clienteIdActual = null;

// ----- INICIALIZACIÓN -----
document.addEventListener('DOMContentLoaded', function() {
    // Navegación
    document.querySelectorAll('.sidebar a[data-page]').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.dataset.page;
            cambiarPagina(page);
            toggleSidebar(false);
        });
    });

    // Formularios
    document.getElementById('clienteForm')?.addEventListener('submit', guardarCliente);
    document.getElementById('configForm')?.addEventListener('submit', guardarConfiguracion);

    // Autocompletar registro
    document.getElementById('regNombre')?.addEventListener('input', autocompletarRegistro);
    document.getElementById('regNombre')?.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('regCelular').focus();
        }
    });
    document.getElementById('regCelular')?.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('regDetalle').focus();
        }
    });
    document.getElementById('regDetalle')?.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            agregarTicket();
        }
    });

    // Atajos de teclado
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.key === 'p') {
            e.preventDefault();
            if (document.getElementById('registro').classList.contains('active')) {
                generarPDF();
            }
        }
        if (e.key === 'Escape') {
            toggleSidebar(false);
        }
    });

    // Inicializar
    actualizarDashboard();
    actualizarListas();
    actualizarReportes();
    actualizarBadge();
    cargarConfiguracion();
    actualizarInfoPrecio();

    console.log('✅ Sistema MEDIA LUNA iniciado');
});

// ----- NAVEGACIÓN -----
function cambiarPagina(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    const target = document.getElementById(page);
    if (target) {
        target.classList.add('active');
    }

    document.querySelectorAll('.sidebar a[data-page]').forEach(link => {
        link.classList.toggle('active', link.dataset.page === page);
    });

    document.dispatchEvent(new CustomEvent('pageChange', { detail: { page: page } }));

    if (page === 'dashboard') actualizarDashboard();
    if (page === 'reportes') actualizarReportes();
    if (page === 'paquetes') actualizarListas();
    if (page === 'clientes') actualizarListas();
    if (page === 'configuracion') cargarConfiguracion();

    toggleSidebar(false);
}

// ----- SIDEBAR -----
function toggleSidebar(forceState) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const isOpen = sidebar.classList.contains('open');

    if (forceState === false) {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        return;
    }

    if (forceState === true || !isOpen) {
        sidebar.classList.add('open');
        overlay.classList.add('active');
    } else {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    }
}

// ----- CONFIGURACIÓN -----
function cargarConfiguracion() {
    const config = DB.getConfiguracion();
    document.getElementById('configMoneda').value = config.moneda || 'Bs';
    document.getElementById('configPrecioBase').value = config.precioBase || 3;
    document.getElementById('configDiasGratis').value = config.diasGratis || 5;
    document.getElementById('configRecargo').value = config.recargo || 0.50;
    actualizarTablaPrecios();
    actualizarInfoPrecio();
}

function guardarConfiguracion(e) {
    e.preventDefault();
    const config = {
        moneda: document.getElementById('configMoneda').value.trim() || 'Bs',
        precioBase: parseFloat(document.getElementById('configPrecioBase').value) || 3,
        diasGratis: parseInt(document.getElementById('configDiasGratis').value) || 5,
        recargo: parseFloat(document.getElementById('configRecargo').value) || 0.50
    };

    DB.guardarConfiguracion(config);
    actualizarTablaPrecios();
    actualizarInfoPrecio();
    actualizarDashboard();
    actualizarReportes();
    actualizarListas();
    mostrarToast('✅ Configuración guardada correctamente', 'success');
}

function actualizarTablaPrecios() {
    const config = DB.getConfiguracion();
    const container = document.getElementById('tablaPreciosPreview');
    if (!container) return;

    let html = `<table style="width:100%;font-size:13px;border-collapse:collapse;">
        <thead>
            <tr style="background:#f0edff;">
                <th style="padding:6px 10px;text-align:left;">Días</th>
                <th style="padding:6px 10px;text-align:left;">Precio</th>
            </tr>
        </thead>
        <tbody>`;

    for (let i = 1; i <= 20; i++) {
        const diasGratis = config.diasGratis || 5;
        let precio = config.precioBase || 3;
        if (i > diasGratis) {
            precio = precio + ((i - diasGratis) * (config.recargo || 0.50));
        }
        const moneda = config.moneda || 'Bs';
        html += `<tr>
            <td style="padding:4px 10px;border-bottom:1px solid #eee;">${i} día${i > 1 ? 's' : ''}</td>
            <td style="padding:4px 10px;border-bottom:1px solid #eee;font-weight:${i === diasGratis ? 'bold' : 'normal'};color:${i === diasGratis ? '#6C5CE7' : '#333'};">${moneda} ${Math.round(precio * 100) / 100} ${i === diasGratis ? '⭐' : ''}</td>
        </tr>`;
    }

    html += `</tbody></table>`;
    container.innerHTML = html;
}

function actualizarInfoPrecio() {
    const config = DB.getConfiguracion();
    const moneda = config.moneda || 'Bs';
    document.getElementById('infoPrecioBase').textContent = config.precioBase || 3;
    document.getElementById('infoDiasGratis').textContent = config.diasGratis || 5;
    document.getElementById('infoRecargo').textContent = config.recargo || 0.50;
    document.getElementById('infoMoneda').textContent = moneda;
    document.getElementById('infoMonedaRecargo').textContent = moneda;
}

// ----- REGISTRO DE TICKETS (CON DETALLE) -----
function agregarTicket() {
    const nombre = document.getElementById('regNombre').value.trim();
    const celular = document.getElementById('regCelular').value.trim();
    const detalle = document.getElementById('regDetalle').value.trim();

    if (!nombre) {
        mostrarToast('⚠️ El nombre del cliente es obligatorio', 'error');
        document.getElementById('regNombre').focus();
        return;
    }

    // Buscar o crear cliente
    let cliente = DB.getClientes().find(c => c.nombre.toLowerCase() === nombre.toLowerCase());
    if (!cliente) {
        cliente = DB.addCliente({ nombre, celular });
        clienteIdActual = cliente.id;
        clienteActual = cliente;
    } else {
        clienteIdActual = cliente.id;
        clienteActual = cliente;
        if (celular && cliente.celular !== celular) {
            DB.updateCliente(cliente.id, { celular });
            cliente = DB.getCliente(cliente.id);
            clienteActual = cliente;
        }
    }

    const config = DB.getConfiguracion();

    const paquete = {
        clienteId: clienteIdActual,
        clienteNombre: cliente.nombre,
        tipo: 'Varios',
        ubicacion: 'Caja 01',
        precioBase: config.precioBase,
        detalle: detalle || ''
    };

    const nuevoPaquete = DB.addPaquete(paquete);
    ticketsGenerados.push(nuevoPaquete);

    actualizarTicketsUI();
    document.getElementById('regDetalle').value = '';
    document.getElementById('regCelular').value = '';
    document.getElementById('regNombre').value = '';
    document.getElementById('regNombre').focus();

    actualizarDashboard();
    actualizarListas();
    actualizarBadge();

    const deuda = DB.calcularDeuda(nuevoPaquete);
    const moneda = config.moneda || 'Bs';
    mostrarToast(`✅ Ticket ${nuevoPaquete.codigo} - ${moneda} ${deuda}`, 'success');

    // Enviar WhatsApp automático
    if (celular) {
        const mensaje = `Hola ${cliente.nombre} 👋\nTu paquete *${nuevoPaquete.codigo}* está listo para recoger.\n\n💰 Deuda: ${moneda} ${deuda}\n\n🔑 Presenta este código al momento de recogerlo.\nEstamos ubicados dentro de la tienda NAHARA.`;
        DB.abrirWhatsApp(celular, mensaje);
    }
}

function eliminarUltimoTicket() {
    if (ticketsGenerados.length === 0) {
        mostrarToast('⚠️ No hay tickets para eliminar', 'warning');
        return;
    }

    const ultimo = ticketsGenerados[ticketsGenerados.length - 1];
    if (!confirm(`¿Eliminar ticket ${ultimo.codigo}?`)) return;

    DB.deletePaquete(ultimo.id);
    ticketsGenerados.pop();

    actualizarTicketsUI();
    actualizarDashboard();
    actualizarListas();
    actualizarBadge();

    mostrarToast(`🗑️ Ticket ${ultimo.codigo} eliminado`, 'error');
}

function actualizarTicketsUI() {
    const container = document.getElementById('ticketsList');
    const count = document.getElementById('ticketCount');
    const moneda = DB.getConfiguracion().moneda || 'Bs';

    if (ticketsGenerados.length === 0) {
        container.innerHTML = '<span style="color:#999;font-size:13px;">No hay tickets generados</span>';
        count.textContent = '0 tickets';
        return;
    }

    container.innerHTML = ticketsGenerados.map(t => {
        const deuda = DB.calcularDeuda(t);
        return `<span class="ticket-tag">${t.codigo} (${moneda} ${deuda})</span>`;
    }).join('');

    count.textContent = `${ticketsGenerados.length} ticket${ticketsGenerados.length > 1 ? 's' : ''}`;
}

// ===== GENERAR PDF =====
function generarPDF() {
    if (ticketsGenerados.length === 0) {
        mostrarToast('⚠️ No hay tickets para generar PDF', 'warning');
        return;
    }

    const cliente = clienteActual || { nombre: 'Sin nombre', celular: '' };
    const config = DB.getConfiguracion();
    const moneda = config.moneda || 'Bs';

    let html = `
        <div style="font-family:'Courier New',monospace;max-width:350px;margin:0 auto;padding:20px;background:white;">
            <div style="text-align:center;border-bottom:3px solid #6C5CE7;padding-bottom:10px;margin-bottom:10px;">
                <div style="font-size:24px;font-weight:800;color:#6C5CE7;">🌙 MEDIA LUNA</div>
                <small style="font-size:11px;color:#666;">Control de Paquetes</small>
            </div>
            <div style="margin:10px 0;font-size:13px;">
                <div style="display:flex;justify-content:space-between;padding:2px 0;">
                    <strong>Cliente:</strong> ${cliente.nombre}
                </div>
                ${cliente.celular ? `<div style="display:flex;justify-content:space-between;padding:2px 0;"><strong>Celular:</strong> ${cliente.celular}</div>` : ''}
                <div style="display:flex;justify-content:space-between;padding:2px 0;">
                    <strong>Fecha:</strong> ${new Date().toLocaleDateString()}
                </div>
            </div>
            <div style="border-top:1px dashed #ccc;margin:10px 0;"></div>
    `;

    ticketsGenerados.forEach((t, i) => {
        const deuda = DB.calcularDeuda(t);
        const dias = DB.calcularDias(t.fechaIngreso);
        html += `
            <div style="text-align:center;padding:10px 0;${i > 0 ? 'border-top:1px dashed #ccc;' : ''}">
                <div style="font-size:28px;font-weight:bold;color:#6C5CE7;">${t.codigo}</div>
                ${t.detalle ? `<div style="font-size:12px;color:#666;">📝 ${t.detalle}</div>` : ''}
                <div style="font-size:13px;color:#666;">📅 ${dias} día${dias > 1 ? 's' : ''}</div>
                <div style="font-size:16px;font-weight:bold;color:${deuda > config.precioBase ? '#E17055' : '#00B894'};">💰 ${moneda} ${deuda}</div>
                <div style="margin-top:5px;">
                    <img src="${DB.generarQR(t.codigo)}" alt="QR" style="max-width:80px;" />
                </div>
            </div>
        `;
    });

    html += `
            <div style="border-top:1px dashed #ccc;margin:10px 0;"></div>
            <div style="text-align:center;font-size:11px;color:#999;">
                Total: ${ticketsGenerados.length} ticket${ticketsGenerados.length > 1 ? 's' : ''}
                <br />⭐ ${config.diasGratis} días gratis · Recargo: ${moneda} ${config.recargo}/día
                <br />Gracias por su preferencia ❤️
            </div>
        </div>
    `;

    const ventana = window.open('', '_blank', 'width=400,height=600');
    ventana.document.write(`
        <html>
            <head>
                <title>Ticket - MEDIA LUNA</title>
                <style>
                    body { margin:0; padding:10px; background:#f0f0f0; font-family: 'Courier New', monospace; }
                    @media print {
                        body { background:white; padding:0; }
                        .no-print { display:none; }
                    }
                </style>
            </head>
            <body>
                ${html}
                <div style="text-align:center;padding:15px;" class="no-print">
                    <button onclick="window.print()" style="padding:10px 30px;background:#6C5CE7;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;">🖨️ Imprimir</button>
                    <button onclick="window.close()" style="padding:10px 30px;background:#666;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;margin-left:10px;">❌ Cerrar</button>
                </div>
            </body>
        </html>
    `);
    ventana.document.close();

    ticketsGenerados = [];
    actualizarTicketsUI();
    clienteActual = null;
    clienteIdActual = null;
    document.getElementById('regNombre').value = '';
    document.getElementById('regCelular').value = '';
    document.getElementById('regDetalle').value = '';

    mostrarToast('📄 PDF generado correctamente', 'success');
}

// ===== WHATSAPP =====
function enviarWhatsAppTicket() {
    if (ticketsGenerados.length === 0) {
        mostrarToast('⚠️ No hay tickets para enviar', 'warning');
        return;
    }

    const cliente = clienteActual;
    if (!cliente || !cliente.celular) {
        mostrarToast('⚠️ El cliente no tiene celular registrado', 'error');
        return;
    }

    const codigos = ticketsGenerados.map(t => t.codigo).join(', ');
    const mensaje = `Hola ${cliente.nombre} 👋\nTus paquetes *${codigos}* están listos para recoger.\n\n📦 Total: ${ticketsGenerados.length} paquete${ticketsGenerados.length > 1 ? 's' : ''}\n🔑 Presenta estos códigos al momento de recogerlos.\n\nEstamos ubicados dentro de la tienda NAHARA.`;

    DB.abrirWhatsApp(cliente.celular, mensaje);
}

function abrirWhatsAppGlobal() {
    const clientes = DB.getClientes();
    const conCelular = clientes.filter(c => c.celular);
    if (conCelular.length === 0) {
        mostrarToast('⚠️ No hay clientes con celular registrado', 'warning');
        return;
    }
    const ultimo = conCelular[conCelular.length - 1];
    const mensaje = `Hola ${ultimo.nombre} 👋\nTe saludamos de MEDIA LUNA.\nTu paquete está listo para recoger.\n\nEstamos ubicados dentro de la tienda NAHARA.`;
    DB.abrirWhatsApp(ultimo.celular, mensaje);
}

// ----- AUTOCOMPLETADO -----
function autocompletarRegistro() {
    const termino = document.getElementById('regNombre').value.trim();
    const box = document.getElementById('suggestions');

    if (termino.length < 2) {
        box.classList.remove('active');
        box.innerHTML = '';
        return;
    }

    const clientes = DB.searchClientes(termino);
    if (clientes.length === 0) {
        box.classList.remove('active');
        return;
    }

    box.innerHTML = clientes.map(c => `
        <div class="suggestion-item" onclick="seleccionarClienteRegistro(${c.id})">
            <div>
                <div class="name">${c.nombre}</div>
                <div class="phone">📱 ${c.celular || 'Sin celular'}</div>
            </div>
        </div>
    `).join('');
    box.classList.add('active');
}

function seleccionarClienteRegistro(id) {
    const cliente = DB.getCliente(id);
    if (!cliente) return;

    document.getElementById('regNombre').value = cliente.nombre;
    document.getElementById('regCelular').value = cliente.celular || '';
    document.getElementById('suggestions').classList.remove('active');

    clienteActual = cliente;
    clienteIdActual = cliente.id;
    document.getElementById('regDetalle').focus();
}

// ===== CLIENTES =====
function mostrarFormCliente() {
    document.getElementById('formCliente').classList.remove('hidden');
    document.getElementById('clienteNombre').focus();
}

function ocultarFormCliente() {
    document.getElementById('formCliente').classList.add('hidden');
    document.getElementById('clienteForm').reset();
}

function guardarCliente(e) {
    e.preventDefault();
    const nombre = document.getElementById('clienteNombre').value.trim();
    const celular = document.getElementById('clienteCelular').value.trim();

    if (!nombre) {
        mostrarToast('⚠️ El nombre es obligatorio', 'error');
        return;
    }

    DB.addCliente({ nombre, celular });
    mostrarToast('✅ Cliente registrado', 'success');
    ocultarFormCliente();
    actualizarListas();
}

function filtrarClientes() {
    const termino = document.getElementById('buscarCliente').value;
    const clientes = DB.searchClientes(termino);
    renderizarClientes(clientes);
}

function renderizarClientes(clientes) {
    const tbody = document.getElementById('listaClientes');
    if (!tbody) return;

    if (clientes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#999;padding:20px;">No hay clientes</td></tr>';
        return;
    }

    tbody.innerHTML = clientes.map(c => {
        const paquetes = DB.getPaquetes().filter(p => p.clienteId === c.id);
        const pendientes = paquetes.filter(p => p.estado === 'pendiente' || p.estado === 'pago_pendiente').length;
        return `
            <tr>
                <td><strong>${c.nombre}</strong></td>
                <td>${c.celular || '-'}</td>
                <td>${paquetes.length} (${pendientes} ⏳)</td>
                <td>
                    <button onclick="verPaquetesCliente(${c.id})" class="btn-primary btn-sm">📋</button>
                    <button onclick="cargarClienteRegistro(${c.id})" class="btn-success btn-sm">➕</button>
                    ${c.celular ? `<button onclick="DB.abrirWhatsApp('${c.celular}','Hola ${c.nombre}, tu paquete está listo para recoger.')" class="btn-sm" style="background:#25D366;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">💬</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

function verPaquetesCliente(id) {
    const cliente = DB.getCliente(id);
    if (!cliente) return;

    const paquetes = DB.getPaquetes().filter(p => p.clienteId === id);
    const pendientes = paquetes.filter(p => p.estado === 'pendiente' || p.estado === 'pago_pendiente');

    let msg = `👤 ${cliente.nombre}\n📱 ${cliente.celular || 'Sin celular'}\n`;
    msg += `📦 ${paquetes.length} paquetes (${pendientes.length} pendientes)\n\n`;
    msg += `📌 CÓDIGOS:\n`;
    paquetes.forEach(p => {
        const deuda = DB.calcularDeuda(p);
        const dias = DB.calcularDias(p.fechaIngreso);
        const estado = p.estado === 'entregado' ? '✅' : p.estado === 'pago_pendiente' ? '💰' : '⏳';
        const moneda = DB.getConfiguracion().moneda || 'Bs';
        msg += `  ${p.codigo} ${estado} ${moneda} ${deuda} (${dias}d) ${p.detalle ? '📝'+p.detalle : ''}\n`;
    });
    alert(msg);
}

function cargarClienteRegistro(id) {
    const cliente = DB.getCliente(id);
    if (!cliente) return;

    cambiarPagina('registro');
    document.getElementById('regNombre').value = cliente.nombre;
    document.getElementById('regCelular').value = cliente.celular || '';
    clienteActual = cliente;
    clienteIdActual = cliente.id;
    document.getElementById('regDetalle').focus();
}

// ===== PAQUETES =====
function filtrarPaquetes() {
    const termino = document.getElementById('buscarPaquete').value;
    const estado = document.getElementById('filtroEstado').value;
    const paquetes = DB.getPaquetesConCliente();
    let filtrados = paquetes;

    if (termino) {
        const t = termino.toLowerCase();
        filtrados = filtrados.filter(p =>
            p.codigo.toLowerCase().includes(t) ||
            p.clienteNombre.toLowerCase().includes(t)
        );
    }

    if (estado) {
        filtrados = filtrados.filter(p => p.estado === estado);
    }

    renderizarPaquetes(filtrados);
}

function renderizarPaquetes(paquetes) {
    const tbody = document.getElementById('listaPaquetes');
    if (!tbody) return;

    if (paquetes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;padding:20px;">No hay paquetes</td></tr>';
        return;
    }

    const moneda = DB.getConfiguracion().moneda || 'Bs';

    tbody.innerHTML = paquetes.map(p => {
        const deuda = DB.calcularDeuda(p);
        const dias = DB.calcularDias(p.fechaIngreso);
        const estadoDisplay = {
            'pendiente': '⏳ Pendiente',
            'entregado': '✅ Entregado',
            'pago_pendiente': '💰 Pago Pendiente'
        }[p.estado] || p.estado;

        const badgeClass = {
            'pendiente': 'badge-pendiente',
            'entregado': 'badge-entregado',
            'pago_pendiente': 'badge-warning'
        }[p.estado] || '';

        return `
            <tr>
                <td><strong style="color:#6C5CE7;">${p.codigo}</strong></td>
                <td>${p.clienteNombre}</td>
                <td>${p.detalle || '-'}</td>
                <td>${dias}</td>
                <td style="font-weight:600;color:${deuda > (DB.getConfiguracion().precioBase || 3) ? '#E17055' : '#00B894'};">${moneda} ${deuda}</td>
                <td><span class="badge ${badgeClass}">${estadoDisplay}</span></td>
                <td>
                    ${p.estado !== 'entregado' ?
                        `<button onclick="entregarPaquete(${p.id})" class="btn-success btn-sm">✅</button>
                         <button onclick="marcarPagoPaquete(${p.id})" class="btn-primary btn-sm">💰</button>` :
                        ''
                    }
                    <button onclick="eliminarPaquete(${p.id})" class="btn-danger btn-sm">🗑️</button>
                    ${p.clienteCelular ? `<button onclick="DB.abrirWhatsApp('${p.clienteCelular}','Hola ${p.clienteNombre}, tu paquete ${p.codigo} está listo.')" class="btn-sm" style="background:#25D366;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">💬</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

function entregarPaquete(id) {
    if (!confirm('¿Marcar este paquete como ENTREGADO?')) return;
    DB.marcarEntregado(id);
    mostrarToast('✅ Paquete entregado', 'success');
    actualizarDashboard();
    actualizarListas();
    actualizarBadge();
    filtrarPaquetes();
}

function marcarPagoPaquete(id) {
    if (!confirm('¿Registrar pago de este paquete?')) return;
    DB.marcarPago(id);
    mostrarToast('💰 Pago registrado', 'success');
    actualizarDashboard();
    actualizarListas();
    actualizarBadge();
    filtrarPaquetes();
}

function eliminarPaquete(id) {
    const paquete = DB.getPaquete(id);
    if (!paquete) return;
    if (!confirm(`¿Eliminar paquete ${paquete.codigo}?`)) return;
    DB.deletePaquete(id);
    mostrarToast(`🗑️ Paquete ${paquete.codigo} eliminado`, 'error');
    actualizarDashboard();
    actualizarListas();
    actualizarBadge();
    filtrarPaquetes();
}

// ===== DASHBOARD =====
function actualizarDashboard() {
    const stats = DB.getEstadisticas();
    const config = DB.getConfiguracion();
    const moneda = config.moneda || 'Bs';

    document.getElementById('totalPaquetes').textContent = stats.total;
    document.getElementById('pendientes').textContent = stats.pendientes;
    document.getElementById('entregados').textContent = stats.entregados;
    document.getElementById('totalClientes').textContent = stats.clientes;

    document.getElementById('monedaDeuda').textContent = moneda;
    document.getElementById('totalDeuda').innerHTML = `<span id="monedaDeuda">${moneda}</span> ${stats.totalDeuda}`;

    document.getElementById('monedaIngresos').textContent = moneda;
    document.getElementById('totalIngresos').innerHTML = `<span id="monedaIngresos">${moneda}</span> ${stats.ingresos}`;

    const ultimos = DB.getUltimosPaquetes(5);
    const tbody = document.getElementById('ultimosPaquetes');
    if (tbody) {
        if (ultimos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;padding:12px;">No hay paquetes</td></tr>';
        } else {
            tbody.innerHTML = ultimos.map(p => `
                <tr>
                    <td><strong style="color:#6C5CE7;">${p.codigo}</strong></td>
                    <td>${p.clienteNombre}</td>
                    <td>${p.diasAlmacenado}</td>
                    <td style="font-weight:600;color:${p.deuda > (DB.getConfiguracion().precioBase || 3) ? '#E17055' : '#00B894'};">${moneda} ${p.deuda}</td>
                    <td><span class="badge ${p.estado === 'pendiente' ? 'badge-pendiente' : 'badge-entregado'}">${p.estado === 'pendiente' ? '⏳' : '✅'}</span></td>
                </tr>
            `).join('');
        }
    }
}

// ===== LISTAS =====
function actualizarListas() {
    const clientes = DB.getClientes();
    renderizarClientes(clientes);

    const paquetes = DB.getPaquetesConCliente();
    renderizarPaquetes(paquetes);
}

// ===== REPORTES =====
function actualizarReportes() {
    const stats = DB.getEstadisticas();
    const config = DB.getConfiguracion();
    const moneda = config.moneda || 'Bs';

    document.getElementById('repTotal').textContent = stats.total;
    document.getElementById('repPendientes').textContent = stats.pendientes;
    document.getElementById('repEntregados').textContent = stats.entregados;
    document.getElementById('monedaRepIngresos').textContent = moneda;
    document.getElementById('repIngresos').innerHTML = `<span id="monedaRepIngresos">${moneda}</span> ${stats.ingresos}`;

    // Gráfico de estados
    const paquetes = DB.getPaquetes();
    const estados = {
        'pendiente': paquetes.filter(p => p.estado === 'pendiente').length,
        'pago_pendiente': paquetes.filter(p => p.estado === 'pago_pendiente').length,
        'entregado': paquetes.filter(p => p.estado === 'entregado').length
    };

    const container = document.getElementById('estadosChart');
    if (container) {
        const total = Object.values(estados).reduce((a, b) => a + b, 0) || 1;
        const colores = {
            'pendiente': '#FDCB6E',
            'pago_pendiente': '#FF7675',
            'entregado': '#00B894'
        };
        const labels = {
            'pendiente': '⏳ Pendiente',
            'pago_pendiente': '💰 Pago Pendiente',
            'entregado': '✅ Entregado'
        };

        container.innerHTML = Object.entries(estados).map(([key, value]) => {
            const height = Math.max(20, (value / total) * 120);
            return `
                <div class="chart-item">
                    <div class="chart-bar-wrap">
                        <div class="chart-bar" style="height:${height}px;background:${colores[key]};">
                            <span class="chart-bar-value">${value}</span>
                        </div>
                    </div>
                    <div class="chart-label">${labels[key]}</div>
                </div>
            `;
        }).join('');
    }
}

// ===== DATOS DE EJEMPLO =====
function cargarDatosEjemplo() {
    if (!confirm('¿Cargar datos de ejemplo? Se limpiarán los datos actuales.')) return;
    DB.cargarDatosEjemplo();
    mostrarToast('✅ Datos de ejemplo cargados', 'success');
    actualizarDashboard();
    actualizarListas();
    actualizarReportes();
    actualizarBadge();
}

function limpiarDatos() {
    if (!confirm('¿Estás seguro de limpiar TODOS los datos? Esta acción no se puede deshacer.')) return;
    DB.limpiarDatos();
    mostrarToast('🗑️ Todos los datos eliminados', 'error');
    actualizarDashboard();
    actualizarListas();
    actualizarReportes();
    actualizarBadge();
}

// ===== TOAST =====
function mostrarToast(mensaje, tipo = 'success') {
    const existing = document.querySelector('.status-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `status-toast ${tipo}`;
    toast.textContent = mensaje;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===== BADGE =====
function actualizarBadge() {
    const stats = DB.getEstadisticas();
    const badge = document.getElementById('pendientesBadge');
    if (badge) {
        badge.textContent = stats.pendientes;
        badge.style.display = stats.pendientes > 0 ? 'inline' : 'none';
    }
}

// ===== AYUDA =====
function mostrarAyuda() {
    const config = DB.getConfiguracion();
    const moneda = config.moneda || 'Bs';
    alert(`🌙 MEDIA LUNA - Control de Paquetes

📌 REGISTRO RÁPIDO:
1. Escribe nombre (autocompleta)
2. Celular (opcional)
3. Detalle (opcional)
4. ENTER para agregar ticket
5. Ctrl+P para generar PDF

💰 PRECIOS:
• Moneda: ${moneda}
• Precio base: ${moneda} ${config.precioBase}
• Días gratis: ${config.diasGratis}
• Recargo diario: ${moneda} ${config.recargo}

📷 ESCÁNER:
1. Presiona "ACTIVAR CÁMARA"
2. Escanea el QR del paquete

⚙️ CONFIGURACIÓN:
• Cambia moneda (Bs, $, S/., etc.)
• Ajusta precios y días gratis

📦 Códigos: A1 hasta Z999`);
}

// ===== EXPORTAR =====
window.cambiarPagina = cambiarPagina;
window.toggleSidebar = toggleSidebar;
window.agregarTicket = agregarTicket;
window.eliminarUltimoTicket = eliminarUltimoTicket;
window.generarPDF = generarPDF;
window.enviarWhatsAppTicket = enviarWhatsAppTicket;
window.seleccionarClienteRegistro = seleccionarClienteRegistro;
window.mostrarFormCliente = mostrarFormCliente;
window.ocultarFormCliente = ocultarFormCliente;
window.guardarCliente = guardarCliente;
window.filtrarClientes = filtrarClientes;
window.filtrarPaquetes = filtrarPaquetes;
window.entregarPaquete = entregarPaquete;
window.marcarPagoPaquete = marcarPagoPaquete;
window.eliminarPaquete = eliminarPaquete;
window.verPaquetesCliente = verPaquetesCliente;
window.cargarClienteRegistro = cargarClienteRegistro;
window.abrirWhatsAppGlobal = abrirWhatsAppGlobal;
window.mostrarAyuda = mostrarAyuda;
window.mostrarToast = mostrarToast;
window.actualizarDashboard = actualizarDashboard;
window.actualizarListas = actualizarListas;
window.actualizarReportes = actualizarReportes;
window.actualizarBadge = actualizarBadge;
window.cargarConfiguracion = cargarConfiguracion;
window.guardarConfiguracion = guardarConfiguracion;
window.cargarDatosEjemplo = cargarDatosEjemplo;
window.limpiarDatos = limpiarDatos;