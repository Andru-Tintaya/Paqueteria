// ===== BASE DE DATOS (localStorage) =====

const DB = {
    // ----- CONFIGURACIÓN POR DEFECTO -----
    CONFIG_DEFAULT: {
        moneda: 'Bs',
        precioBase: 3,
        diasGratis: 5,
        recargo: 0.50
    },

    // ----- OBTENER DATOS -----
    getAll: function() {
        const data = localStorage.getItem('mediaLunaDB');
        if (!data) {
            const initial = {
                clientes: [],
                paquetes: [],
                historial: [],
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

        let letra = ultimo[0];
        let numero = parseInt(ultimo.substring(1)) || 0;

        if (numero >= 999) {
            if (letra === 'Z') {
                letra = 'A';
                numero = 0;
            } else {
                letra = String.fromCharCode(letra.charCodeAt(0) + 1);
                numero = 0;
            }
        }
        numero++;

        const nuevoCodigo = `${letra}${numero}`;
        data.ultimoCodigo = nuevoCodigo;
        this.save(data);
        return nuevoCodigo;
    },

    addPaquete: function(paquete) {
        const data = this.getAll();
        const codigo = this.generarCodigo();
        paquete.id = data.nextIdPaquete++;
        paquete.codigo = codigo;
        paquete.fechaIngreso = new Date().toISOString().split('T')[0];
        paquete.estado = 'pendiente';
        paquete.pagado = false;
        data.paquetes.push(paquete);
        this.save(data);
        this.agregarHistorial(codigo, 'RECIBIDO', `Paquete registrado para ${paquete.clienteNombre}`);
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
        const paquete = data.paquetes.find(p => p.id === id);
        if (paquete) {
            this.agregarHistorial(paquete.codigo, 'ELIMINADO', `Paquete eliminado del sistema`);
        }
        data.paquetes = data.paquetes.filter(p => p.id !== id);
        this.save(data);
        return true;
    },

    marcarEntregado: function(id) {
        const paquete = this.getPaquete(id);
        if (!paquete) return null;
        const resultado = this.updatePaquete(id, {
            estado: 'entregado',
            fechaEntrega: new Date().toISOString().split('T')[0]
        });
        if (resultado) {
            this.agregarHistorial(paquete.codigo, 'ENTREGADO', `Paquete entregado`);
        }
        return resultado;
    },

    marcarPago: function(id) {
        const paquete = this.getPaquete(id);
        if (!paquete) return null;
        const resultado = this.updatePaquete(id, {
            pagado: true,
            estado: paquete.estado === 'pendiente' ? 'pendiente' : paquete.estado
        });
        if (resultado) {
            this.agregarHistorial(paquete.codigo, 'PAGO', `Pago registrado: ${this.getConfiguracion().moneda} ${this.calcularDeuda(paquete)}`);
        }
        return resultado;
    },

    // ----- HISTORIAL -----
    getHistorial: function() {
        return this.getAll().historial || [];
    },

    agregarHistorial: function(codigo, accion, detalle) {
        const data = this.getAll();
        if (!data.historial) data.historial = [];
        data.historial.push({
            fecha: new Date().toISOString(),
            codigo: codigo,
            accion: accion,
            detalle: detalle
        });
        this.save(data);
    },

    // ----- CÁLCULOS CON CONFIGURACIÓN -----
    calcularDeuda: function(paquete) {
        if (paquete.estado === 'entregado' && paquete.pagado) return 0;
        if (paquete.pagado) return 0;

        const config = this.getConfiguracion();
        const precioBase = config.precioBase || 3;
        const diasGratis = config.diasGratis || 5;
        const recargo = config.recargo || 0.50;

        const fechaIngreso = new Date(paquete.fechaIngreso);
        const hoy = new Date();
        const diffTime = Math.abs(hoy - fechaIngreso);
        const diffDias = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let deuda = precioBase;

        if (diffDias > diasGratis) {
            const diasExtra = diffDias - diasGratis;
            deuda = precioBase + (diasExtra * recargo);
        }

        return Math.round(deuda * 100) / 100;
    },

    calcularDias: function(fechaIngreso) {
        const fecha = new Date(fechaIngreso);
        const hoy = new Date();
        const diffTime = Math.abs(hoy - fecha);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    },

    getEstadisticas: function() {
        const paquetes = this.getPaquetes();
        const clientes = this.getClientes();
        const total = paquetes.length;
        const pendientes = paquetes.filter(p => p.estado === 'pendiente').length;
        const entregados = paquetes.filter(p => p.estado === 'entregado').length;
        const pagoPendiente = paquetes.filter(p => p.estado === 'pago_pendiente').length;

        let totalDeuda = 0;
        let ingresos = 0;
        paquetes.forEach(p => {
            const deuda = this.calcularDeuda(p);
            if (p.estado !== 'entregado' || !p.pagado) {
                totalDeuda += deuda;
            }
            if (p.estado === 'entregado' && p.pagado) {
                ingresos += deuda;
            }
        });

        return {
            total,
            pendientes,
            entregados,
            pagoPendiente,
            clientes: clientes.length,
            totalDeuda: Math.round(totalDeuda * 100) / 100,
            ingresos: Math.round(ingresos * 100) / 100
        };
    },

    getUltimosPaquetes: function(limit = 5) {
        const paquetes = this.getPaquetes().slice(-limit).reverse();
        const clientes = this.getClientes();
        return paquetes.map(p => {
            const cliente = clientes.find(c => c.id === p.clienteId);
            return {
                ...p,
                clienteNombre: cliente ? cliente.nombre : 'Desconocido',
                deuda: this.calcularDeuda(p),
                diasAlmacenado: this.calcularDias(p.fechaIngreso)
            };
        });
    },

    getPaquetesConCliente: function() {
        const paquetes = this.getPaquetes();
        const clientes = this.getClientes();
        return paquetes.map(p => {
            const cliente = clientes.find(c => c.id === p.clienteId);
            return {
                ...p,
                clienteNombre: cliente ? cliente.nombre : 'Desconocido',
                clienteCelular: cliente ? cliente.celular : '',
                deuda: this.calcularDeuda(p),
                diasAlmacenado: this.calcularDias(p.fechaIngreso)
            };
        });
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
        const config = this.getConfiguracion();
        const hoy = new Date();

        const clientes = [
            { nombre: 'Juan Pérez', celular: '76543210' },
            { nombre: 'María García', celular: '71234567' },
            { nombre: 'Pedro Rodríguez', celular: '79876543' },
            { nombre: 'Ana Martínez', celular: '72345678' },
            { nombre: 'Carlos López', celular: '73456789' }
        ];

        // Limpiar datos existentes
        const data = this.getAll();
        data.clientes = [];
        data.paquetes = [];
        data.historial = [];
        data.nextIdCliente = 1;
        data.nextIdPaquete = 1;
        data.ultimoCodigo = 'A0';
        this.save(data);

        // Crear clientes
        const clientesCreados = [];
        clientes.forEach(c => {
            clientesCreados.push(this.addCliente(c));
        });

        // Crear paquetes
        for (let i = 0; i < 25; i++) {
            const cliente = clientesCreados[Math.floor(Math.random() * clientesCreados.length)];
            const diasAtras = Math.floor(Math.random() * 18);
            const fecha = new Date(hoy);
            fecha.setDate(fecha.getDate() - diasAtras);

            const estado = Math.random() > 0.4 ? 'pendiente' : (Math.random() > 0.5 ? 'entregado' : 'pago_pendiente');
            const pagado = estado === 'entregado' ? Math.random() > 0.3 : false;

            const paquete = {
                clienteId: cliente.id,
                clienteNombre: cliente.nombre,
                tipo: 'Varios',
                ubicacion: 'Caja 01',
                precioBase: config.precioBase,
                detalle: '',
                fechaIngreso: fecha.toISOString().split('T')[0],
                estado: estado,
                pagado: pagado
            };

            const nuevo = this.addPaquete(paquete);
            const dataActual = this.getAll();
            const index = dataActual.paquetes.findIndex(p => p.id === nuevo.id);
            if (index !== -1) {
                dataActual.paquetes[index].fechaIngreso = fecha.toISOString().split('T')[0];
                if (estado === 'entregado') {
                    const fechaEntrega = new Date(fecha);
                    fechaEntrega.setDate(fechaEntrega.getDate() + Math.floor(Math.random() * 5) + 1);
                    dataActual.paquetes[index].fechaEntrega = fechaEntrega.toISOString().split('T')[0];
                }
                this.save(dataActual);
            }
        }

        return true;
    },

    limpiarDatos: function() {
        const data = this.getAll();
        data.clientes = [];
        data.paquetes = [];
        data.historial = [];
        data.nextIdCliente = 1;
        data.nextIdPaquete = 1;
        data.ultimoCodigo = 'A0';
        this.save(data);
        return true;
    }
};

// Inicializar
DB.getAll();