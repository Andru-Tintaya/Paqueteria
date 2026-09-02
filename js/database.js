// ===== BASE DE DATOS (localStorage) =====

const DB = {
    // ----- CONFIGURACIÓN POR DEFECTO -----
    CONFIG_DEFAULT: {
        codigoDesde: 'A1',
        codigoHasta: 'Z999',
        reinicioAuto: true
    },

    // ----- OBTENER DATOS -----
    getAll: function() {
        const data = localStorage.getItem('mediaLunaDB');
        if (!data) {
            const initial = {
                clientes: [],
                paquetes: [],
                configuracion: this.CONFIG_DEFAULT,
                nextIdCliente: 1,
                nextIdPaquete: 1,
                ultimoCodigo: 'A0'
            };
            localStorage.setItem('mediaLunaDB', JSON.stringify(initial));
            return initial;
        }
        return JSON.parse(data);
    },

    save: function(data) {
        localStorage.setItem('mediaLunaDB', JSON.stringify(data));
        return data;
    },

    // ----- CONFIGURACIÓN -----
    getConfiguracion: function() {
        const data = this.getAll();
        return data.configuracion || this.CONFIG_DEFAULT;
    },

    guardarConfiguracion: function(config) {
        const data = this.getAll();
        data.configuracion = config;
        this.save(data);
        return config;
    },

    // ----- CLIENTES -----
    getClientes: function() {
        return this.getAll().clientes;
    },

    getCliente: function(id) {
        return this.getClientes().find(c => c.id === id);
    },

    addCliente: function(cliente) {
        const data = this.getAll();
        cliente.id = data.nextIdCliente++;
        cliente.fecha = new Date().toISOString().split('T')[0];
        data.clientes.push(cliente);
        this.save(data);
        return cliente;
    },

    updateCliente: function(id, updates) {
        const data = this.getAll();
        const index = data.clientes.findIndex(c => c.id === id);
        if (index === -1) return null;
        data.clientes[index] = { ...data.clientes[index], ...updates };
        this.save(data);
        return data.clientes[index];
    },

    deleteCliente: function(id) {
        const data = this.getAll();
        data.clientes = data.clientes.filter(c => c.id !== id);
        this.save(data);
        return true;
    },

    searchClientes: function(termino) {
        const clientes = this.getClientes();
        if (!termino) return clientes;
        const t = termino.toLowerCase();
        return clientes.filter(c =>
            c.nombre.toLowerCase().includes(t) ||
            (c.celular && c.celular.includes(t))
        );
    },

    // ----- PAQUETES -----
    getPaquetes: function() {
        return this.getAll().paquetes;
    },

    getPaquete: function(id) {
        return this.getPaquetes().find(p => p.id === id);
    },

    getPaqueteByCodigo: function(codigo) {
        return this.getPaquetes().find(p => p.codigo === codigo);
    },

    generarCodigo: function() {
        const data = this.getAll();
        let ultimo = data.ultimoCodigo || 'A0';
        const config = this.getConfiguracion();
        
        let letra = ultimo[0];
        let numero = parseInt(ultimo.substring(1)) || 0;
        
        numero++;
        
        if (numero > 999) {
            if (letra === 'Z') {
                if (config.reinicioAuto !== false) {
                    letra = 'A';
                    numero = 1;
                } else {
                    mostrarToast('⚠️ Límite de códigos alcanzado (Z999)', 'error');
                    return null;
                }
            } else {
                letra = String.fromCharCode(letra.charCodeAt(0) + 1);
                numero = 1;
            }
        }
        
        const nuevoCodigo = `${letra}${numero}`;
        data.ultimoCodigo = nuevoCodigo;
        this.save(data);
        return nuevoCodigo;
    },

    // Método para agregar paquete con código ya definido (desde escáner)
    addPaqueteDirecto: function(paquete) {
        const data = this.getAll();
        const codigo = paquete.codigo;
        
        // Verificar que no exista
        if (this.getPaqueteByCodigo(codigo)) {
            return null;
        }
        
        paquete.id = data.nextIdPaquete++;
        paquete.fechaIngreso = paquete.fechaIngreso || new Date().toISOString().split('T')[0];
        paquete.estado = paquete.estado || 'pendiente';
        paquete.pagado = paquete.pagado || false;
        data.paquetes.push(paquete);
        
        // Actualizar último código
        const match = codigo.match(/^([A-Z])(\d+)$/);
        if (match) {
            const letra = match[1];
            const numero = parseInt(match[2]);
            const ultimo = data.ultimoCodigo || 'A0';
            const uLetra = ultimo[0];
            const uNumero = parseInt(ultimo.substring(1)) || 0;
            if (letra > uLetra || (letra === uLetra && numero > uNumero)) {
                data.ultimoCodigo = codigo;
            }
        }
        
        this.save(data);
        return paquete;
    },

    addPaquete: function(paquete) {
        const data = this.getAll();
        const codigo = this.generarCodigo();
        if (!codigo) return null;
        
        paquete.id = data.nextIdPaquete++;
        paquete.codigo = codigo;
        paquete.fechaIngreso = new Date().toISOString().split('T')[0];
        paquete.estado = 'pendiente';
        paquete.pagado = false;
        data.paquetes.push(paquete);
        this.save(data);
        return paquete;
    },

    updatePaquete: function(id, updates) {
        const data = this.getAll();
        const index = data.paquetes.findIndex(p => p.id === id);
        if (index === -1) return null;
        data.paquetes[index] = { ...data.paquetes[index], ...updates };
        this.save(data);
        return data.paquetes[index];
    },

    deletePaquete: function(id) {
        const data = this.getAll();
        data.paquetes = data.paquetes.filter(p => p.id !== id);
        this.save(data);
        return true;
    },

    marcarEntregado: function(id) {
        return this.updatePaquete(id, {
            estado: 'entregado',
            fechaEntrega: new Date().toISOString().split('T')[0]
        });
    },

    searchPaquetes: function(termino, estado) {
        let paquetes = this.getPaquetes();
        if (termino) {
            const t = termino.toLowerCase();
            paquetes = paquetes.filter(p =>
                p.codigo.toLowerCase().includes(t) ||
                p.clienteNombre.toLowerCase().includes(t) ||
                (p.clienteCelular && p.clienteCelular.includes(t))
            );
        }
        if (estado) {
            paquetes = paquetes.filter(p => p.estado === estado);
        }
        return paquetes;
    },

    // ----- ESTADÍSTICAS -----
    getEstadisticas: function() {
        const paquetes = this.getPaquetes();
        const clientes = this.getClientes();
        const total = paquetes.length;
        const pendientes = paquetes.filter(p => p.estado === 'pendiente').length;
        const entregados = paquetes.filter(p => p.estado === 'entregado').length;

        return {
            total,
            pendientes,
            entregados,
            clientes: clientes.length
        };
    },

    getUltimosPaquetes: function(limit = 5) {
        const paquetes = this.getPaquetes().slice(-limit).reverse();
        return paquetes;
    },

    // ----- WHATSAPP -----
    abrirWhatsApp: function(telefono, mensaje) {
        if (!telefono) return;
        let numero = telefono.replace(/\s/g, '').replace(/[^0-9]/g, '');
        if (!numero.startsWith('591')) {
            numero = '591' + numero;
        }
        window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, '_blank');
    },

    // ----- QR -----
    generarQR: function(codigo) {
        return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${codigo}`;
    },

    // ===== DATOS DE EJEMPLO =====
    cargarDatosEjemplo: function() {
        const hoy = new Date();
        
        const paquetesEjemplo = [
            { codigo: 'A1', clienteNombre: 'Juan Pérez', clienteCelular: '76543210', detalle: 'Camisa de vestir', quienDejo: 'María', fechaIngreso: this._formatDate(new Date(hoy.getTime() - 2*24*60*60*1000)), estado: 'pendiente' },
            { codigo: 'A2', clienteNombre: 'María García', clienteCelular: '71234567', detalle: 'Vajilla de porcelana', quienDejo: 'Carlos', fechaIngreso: this._formatDate(new Date(hoy.getTime() - 1*24*60*60*1000)), estado: 'pendiente' },
            { codigo: 'A3', clienteNombre: 'Pedro Rodríguez', clienteCelular: '79876543', detalle: 'Juguete', quienDejo: 'Ana', fechaIngreso: this._formatDate(new Date(hoy.getTime() - 3*24*60*60*1000)), estado: 'entregado' },
            { codigo: 'A4', clienteNombre: 'Ana Martínez', clienteCelular: '72345678', detalle: 'Maquillaje', quienDejo: 'Luis', fechaIngreso: this._formatDate(hoy), estado: 'pendiente' },
            { codigo: 'A5', clienteNombre: 'Carlos López', clienteCelular: '73456789', detalle: 'Electrónicos', quienDejo: 'Sofía', fechaIngreso: this._formatDate(new Date(hoy.getTime() - 5*24*60*60*1000)), estado: 'entregado' }
        ];
        
        // Limpiar datos existentes
        const data = this.getAll();
        data.clientes = [];
        data.paquetes = [];
        data.nextIdCliente = 1;
        data.nextIdPaquete = 1;
        data.ultimoCodigo = 'A5';
        this.save(data);
        
        // Agregar paquetes
        paquetesEjemplo.forEach(p => {
            this.addPaqueteDirecto(p);
        });
        
        // Crear algunos clientes
        const nombres = ['Juan Pérez', 'María García', 'Pedro Rodríguez', 'Ana Martínez', 'Carlos López'];
        nombres.forEach(n => {
            const cel = '7' + Math.floor(10000000 + Math.random() * 90000000);
            this.addCliente({ nombre: n, celular: cel });
        });
        
        return true;
    },

    _formatDate: function(date) {
        return date.toISOString().split('T')[0];
    },

    limpiarDatos: function() {
        const data = this.getAll();
        data.clientes = [];
        data.paquetes = [];
        data.nextIdCliente = 1;
        data.nextIdPaquete = 1;
        data.ultimoCodigo = 'A0';
        this.save(data);
        return true;
    }
};

// Inicializar
DB.getAll();