// ===== APP PRINCIPAL =====

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
    document.getElementById('registroManualForm')?.addEventListener('submit', guardarManual);

    // Autocompletar en registro manual
    document.getElementById('regNombre')?.addEventListener('input', autocompletarRegistro);

    // Atajos de teclado
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            toggleSidebar(false);
        }
    });

    // Generar código automático al cargar registro manual
    generarCodigoManual();

    // Inicializar
    actualizarDashboard();
    actualizarListas();
    actualizarBadge();
    cargarConfiguracion();

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
    if (page === 'paquetes') actualizarListas();
    if (page === 'clientes') actualizarListas();
    if (page === 'registro') generarCodigoManual();
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

// ----- GENERAR CÓDIGO MANUAL -----
function generarCodigoManual() {
    const codigo = DB.generarCodigo();
    if (codigo) {
        document.getElementById('regCodigo').value = codigo;
        document.getElementById('codigoActual').textContent = `Código: ${codigo}`;
    }
}

// ----- REGISTRO MANUAL -----
function guardarManual(e) {
    e.preventDefault();
    
    const codigo = document.getElementById('regCodigo').value.trim().toUpperCase();
    const nombre = document.getElementById('regNombre').value.trim();
    const celular = document.getElementById('regCelular').value.trim();
    const detalle = document.getElementById('regDetalle').value.trim();
    const quienDejo = document.getElementById('regQuienDejo').value.trim();
    
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
    document.getElementById('regNombre').value = '';
    document.getElementById('regCelular').value = '';
    document.getElementById('regDetalle').value = '';
    document.getElementById('regQuienDejo').value = '';
    
    generarCodigoManual();
    actualizarDashboard();
    actualizarListas();
    actualizarBadge();
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

    // Crear sugerencias
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
}

// ----- CLIENTES -----
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
        const paquetes = DB.getPaquetes().filter(p => p.clienteNombre === c.nombre);
        const pendientes = paquetes.filter(p => p.estado === 'pendiente').length;
        return `
            <tr>
                <td><strong>${c.nombre}</strong></td>
                <td>${c.celular || '-'}</td>
                <td>${paquetes.length} (${pendientes} ⏳)</td>
                <td>
                    <button onclick="verPaquetesCliente('${c.nombre}')" class="btn-primary btn-sm">📋</button>
                    ${c.celular ? `<button onclick="DB.abrirWhatsApp('${c.celular}','Hola ${c.nombre}, tu paquete está listo para recoger.')" class="btn-sm" style="background:#25D366;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">💬</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

function verPaquetesCliente(nombre) {
    const paquetes = DB.getPaquetes().filter(p => p.clienteNombre === nombre);
    const pendientes = paquetes.filter(p => p.estado === 'pendiente');

    let msg = `👤 ${nombre}\n📦 ${paquetes.length} paquetes (${pendientes.length} pendientes)\n\n`;
    msg += `📌 CÓDIGOS:\n`;
    paquetes.forEach(p => {
        const estado = p.estado === 'entregado' ? '✅' : '⏳';
        msg += `  ${p.codigo} ${estado} ${p.detalle || ''}\n`;
    });
    alert(msg);
}

// ----- PAQUETES -----
function filtrarPaquetes() {
    const termino = document.getElementById('buscarPaquete').value;
    const estado = document.getElementById('filtroEstado').value;
    const paquetes = DB.searchPaquetes(termino, estado);
    renderizarPaquetes(paquetes);
}

function renderizarPaquetes(paquetes) {
    const tbody = document.getElementById('listaPaquetes');
    if (!tbody) return;

    if (paquetes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;padding:20px;">No hay paquetes</td></tr>';
        return;
    }

    tbody.innerHTML = paquetes.map(p => {
        const estadoDisplay = {
            'pendiente': '⏳ Pendiente',
            'entregado': '✅ Entregado'
        }[p.estado] || p.estado;

        const badgeClass = {
            'pendiente': 'badge-pendiente',
            'entregado': 'badge-entregado'
        }[p.estado] || '';

        return `
            <tr>
                <td><strong style="color:#6C5CE7;font-size:16px;">${p.codigo}</strong></td>
                <td><strong>${p.clienteNombre}</strong></td>
                <td>${p.clienteCelular || '-'}</td>
                <td>${p.detalle || '-'}</td>
                <td>${p.fechaIngreso}</td>
                <td><span class="badge ${badgeClass}">${estadoDisplay}</span></td>
                <td>
                    ${p.estado === 'pendiente' ?
                        `<button onclick="entregarPaquete(${p.id})" class="btn-success btn-sm">✅</button>` :
                        ''
                    }
                    <button onclick="eliminarPaquete(${p.id})" class="btn-danger btn-sm">🗑️</button>
                    ${p.clienteCelular ? `<button onclick="DB.abrirWhatsApp('${p.clienteCelular}','Hola ${p.clienteNombre}, tu paquete ${p.codigo} está listo.')" class="btn-sm" style="background:#25D366;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">💬</button>` : ''}
                    <button onclick="verDetallePaquete(${p.id})" class="btn-primary btn-sm">👁️</button>
                </td>
            </tr>
        `;
    }).join('');
}

function verDetallePaquete(id) {
    const p = DB.getPaquete(id);
    if (!p) return;
    
    alert(`📦 PAQUETE ${p.codigo}\n\n👤 Cliente: ${p.clienteNombre}\n📱 Celular: ${p.clienteCelular || 'N/A'}\n📝 Detalle: ${p.detalle || 'Sin detalle'}\n👤 Quien lo dejó: ${p.quienDejo || 'No especificado'}\n📅 Fecha: ${p.fechaIngreso}\n📊 Estado: ${p.estado === 'pendiente' ? '⏳ Pendiente' : '✅ Entregado'}`);
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
    document.getElementById('totalPaquetes').textContent = stats.total;
    document.getElementById('pendientes').textContent = stats.pendientes;
    document.getElementById('entregados').textContent = stats.entregados;
    document.getElementById('totalClientes').textContent = stats.clientes;

    const ultimos = DB.getUltimosPaquetes(5);
    const tbody = document.getElementById('ultimosPaquetes');
    if (tbody) {
        if (ultimos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#999;padding:12px;">No hay paquetes</td></tr>';
        } else {
            tbody.innerHTML = ultimos.map(p => `
                <tr>
                    <td><strong style="color:#6C5CE7;">${p.codigo}</strong></td>
                    <td>${p.clienteNombre}</td>
                    <td>${p.clienteCelular || '-'}</td>
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

    const paquetes = DB.getPaquetes();
    renderizarPaquetes(paquetes);
}

// ===== CONFIGURACIÓN =====
function cargarConfiguracion() {
    const config = DB.getConfiguracion();
    document.getElementById('configCodigoDesde').value = config.codigoDesde || 'A1';
    document.getElementById('configCodigoHasta').value = config.codigoHasta || 'Z999';
    document.getElementById('configReinicioAuto').checked = config.reinicioAuto !== false;
}

function guardarConfiguracion(e) {
    e.preventDefault();
    const config = {
        codigoDesde: document.getElementById('configCodigoDesde').value.trim().toUpperCase() || 'A1',
        codigoHasta: document.getElementById('configCodigoHasta').value.trim().toUpperCase() || 'Z999',
        reinicioAuto: document.getElementById('configReinicioAuto').checked
    };
    
    DB.guardarConfiguracion(config);
    mostrarToast('✅ Configuración guardada', 'success');
}

// ===== WHATSAPP =====
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

// ===== EXPORTAR =====
function exportarLista() {
    const paquetes = DB.getPaquetes();
    if (paquetes.length === 0) {
        mostrarToast('⚠️ No hay datos para exportar', 'warning');
        return;
    }
    
    let texto = '=== LISTA DE PAQUETES ===\n\n';
    texto += `Fecha: ${new Date().toLocaleDateString()}\n`;
    texto += `Total: ${paquetes.length} paquetes\n\n`;
    texto += 'Código | Cliente | Celular | Detalle | Estado\n';
    texto += '='.repeat(60) + '\n';
    
    paquetes.forEach(p => {
        texto += `${p.codigo} | ${p.clienteNombre} | ${p.clienteCelular || '-'} | ${p.detalle || '-'} | ${p.estado}\n`;
    });
    
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `paquetes_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    mostrarToast('📥 Lista exportada', 'success');
}

// ===== DATOS DE EJEMPLO =====
function cargarDatosEjemplo() {
    if (!confirm('¿Cargar datos de ejemplo? Se limpiarán los datos actuales.')) return;
    DB.cargarDatosEjemplo();
    mostrarToast('✅ Datos de ejemplo cargados', 'success');
    actualizarDashboard();
    actualizarListas();
    actualizarBadge();
}

function limpiarDatos() {
    if (!confirm('¿Estás seguro de limpiar TODOS los datos? Esta acción no se puede deshacer.')) return;
    DB.limpiarDatos();
    mostrarToast('🗑️ Todos los datos eliminados', 'error');
    actualizarDashboard();
    actualizarListas();
    actualizarBadge();
    generarCodigoManual();
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
    alert(`🌙 MEDIA LUNA - Control de Paquetes

📷 ESCÁNER (PRIMORDIAL):
1. Ve a "Escanear Ticket"
2. Presiona "ACTIVAR CÁMARA"
3. Enfoca el código del ticket (A1, B25, etc.)
4. Si el código NO existe → Se abre formulario para completar datos
5. Si el código YA existe → Muestra la información del paquete

📝 REGISTRO MANUAL:
• Usa esta opción cuando no tengas ticket físico
• El código se genera automáticamente (A1 → Z999)
• Al llegar a Z999, reinicia desde A1

📋 LISTA DE PAQUETES:
• Todos los paquetes registrados
• Filtra por estado (Pendiente/Entregado)
• Exporta la lista a archivo de texto

👤 CLIENTES:
• Registra clientes frecuentes
• Busca por nombre o celular

⚙️ CONFIGURACIÓN:
• Cambia el rango de códigos
• Activa/desactiva el reinicio automático

📦 Códigos: A1 hasta Z999`);
}

// ===== EXPORTAR =====
window.cambiarPagina = cambiarPagina;
window.toggleSidebar = toggleSidebar;
window.agregarTicket = function() { cambiarPagina('registro'); };
window.mostrarFormCliente = mostrarFormCliente;
window.ocultarFormCliente = ocultarFormCliente;
window.guardarCliente = guardarCliente;
window.filtrarClientes = filtrarClientes;
window.filtrarPaquetes = filtrarPaquetes;
window.entregarPaquete = entregarPaquete;
window.eliminarPaquete = eliminarPaquete;
window.verPaquetesCliente = verPaquetesCliente;
window.verDetallePaquete = verDetallePaquete;
window.abrirWhatsAppGlobal = abrirWhatsAppGlobal;
window.exportarLista = exportarLista;
window.mostrarAyuda = mostrarAyuda;
window.mostrarToast = mostrarToast;
window.actualizarDashboard = actualizarDashboard;
window.actualizarListas = actualizarListas;
window.actualizarBadge = actualizarBadge;
window.cargarConfiguracion = cargarConfiguracion;
window.guardarConfiguracion = guardarConfiguracion;
window.cargarDatosEjemplo = cargarDatosEjemplo;
window.limpiarDatos = limpiarDatos;
window.seleccionarClienteRegistro = seleccionarClienteRegistro;
window.generarCodigoManual = generarCodigoManual;
window.guardarManual = guardarManual;