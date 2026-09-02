// ===== BASE DE DATOS (localStorage) =====

const DB = {
    // ----- CONFIGURACIÓN POR DEFECTO -----
    CONFIG_DEFAULT: {
        // Configuración de códigos
        codigoDesde: 'A1',
        codigoHasta: 'Z999',
        reinicioAuto: true,
        // ===== CONFIGURACIÓN DE PRECIOS =====
        moneda: 'Bs',
        precioBase: 3,
        diasGratis: 5,
        recargo: 0.50,
        // Precios para diferentes tipos (opcional)
        preciosPorTipo: {
            'Ropa': 3,
            'Vajilla': 4,
            'Juguetes': 3,
            'Maquillaje': 3,
            'Electrónicos': 6,
            'Varios': 3
        },
        // Recargos según precio base
        recargosPorPrecio: {
            2: 0.50,
            3: 0.50,
            4: 1.00,
            6: 1.00
        }
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
        
        // Si no tiene precio base, usar el de configuración
        if (!paquete.precioBase) {
            const config = this.getConfiguracion();
            paquete.precioBase = config.precioBase || 3;
        }
        
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
        
        const config = this.getConfiguracion();
        
        paquete.id = data.nextIdPaquete++;
        paquete.codigo = codigo;
        paquete.fechaIngreso = new Date().toISOString().split('T')[0];
        paquete.estado = 'pendiente';
        paquete.pagado = false;
        paquete.precioBase = paquete.precioBase || config.precioBase || 3;
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
        const paquete = this.getPaquete(id);
        if (!paquete) return null;
        
        // Calcular deuda final antes de entregar
        const deuda = this.calcularDeuda(paquete);
        
        const resultado = this.updatePaquete(id, {
            estado: 'entregado',
            fechaEntrega: new Date().toISOString().split('T')[0],
            montoPagado: deuda
        });
        return resultado;
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

    // ==========================================
    // ===== CÁLCULO DE DEUDA CON CONFIGURACIÓN =====
    // ==========================================
    calcularDeuda: function(paquete) {
        // Si ya está entregado y pagado, deuda 0
        if (paquete.estado === 'entregado' && paquete.pagado) return 0;
        if (paquete.pagado) return 0;

        const config = this.getConfiguracion();
        
        // Obtener precio base del paquete o de configuración
        let precioBase = paquete.precioBase || config.precioBase || 3;
        const diasGratis = config.diasGratis || 5;
        
        // Obtener recargo según precio base
        let recargo = config.recargo || 0.50;
        if (config.recargosPorPrecio && config.recargosPorPrecio[precioBase]) {
            recargo = config.recargosPorPrecio[precioBase];
        }

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

    // Obtener información de deuda para mostrar en lista
    getPaqueteConDeuda: function(paquete) {
        const deuda = this.calcularDeuda(paquete);
        const dias = this.calcularDias(paquete.fechaIngreso);
        const config = this.getConfiguracion();
        const moneda = config.moneda || 'Bs';
        
        // Determinar si tiene recargo
        const tieneRecargo = dias > (config.diasGratis || 5);
        const diasExtra = tieneRecargo ? dias - (config.diasGratis || 5) : 0;
        
        return {
            ...paquete,
            deuda: deuda,
            dias: dias,
            moneda: moneda,
            tieneRecargo: tieneRecargo,
            diasExtra: diasExtra,
            precioBase: paquete.precioBase || config.precioBase || 3,
            diasGratis: config.diasGratis || 5,
            recargo: config.recargo || 0.50,
            estadoDisplay: paquete.estado === 'pendiente' ? '⏳ Pendiente' : '✅ Entregado'
        };
    },

    getEstadisticas: function() {
        const paquetes = this.getPaquetes();
        const clientes = this.getClientes();
        const config = this.getConfiguracion();
        const total = paquetes.length;
        const pendientes = paquetes.filter(p => p.estado === 'pendiente').length;
        const entregados = paquetes.filter(p => p.estado === 'entregado').length;

        let totalDeuda = 0;
        let totalIngresos = 0;
        let paquetesConRecargo = 0;
        
        paquetes.forEach(p => {
            const deuda = this.calcularDeuda(p);
            if (p.estado !== 'entregado') {
                totalDeuda += deuda;
            }
            if (p.estado === 'entregado') {
                totalIngresos += deuda;
            }
            // Contar paquetes con recargo
            const dias = this.calcularDias(p.fechaIngreso);
            if (dias > (config.diasGratis || 5) && p.estado !== 'entregado') {
                paquetesConRecargo++;
            }
        });

        return {
            total,
            pendientes,
            entregados,
            clientes: clientes.length,
            totalDeuda: Math.round(totalDeuda * 100) / 100,
            totalIngresos: Math.round(totalIngresos * 100) / 100,
            paquetesConRecargo
        };
    },

    getUltimosPaquetes: function(limit = 5) {
        const paquetes = this.getPaquetes().slice(-limit).reverse();
        return paquetes.map(p => this.getPaqueteConDeuda(p));
    },

    getPaquetesConDeuda: function() {
        const paquetes = this.getPaquetes();
        return paquetes.map(p => this.getPaqueteConDeuda(p));
    },

    getPaquetesPendientes: function() {
        const paquetes = this.getPaquetes().filter(p => p.estado === 'pendiente');
        return paquetes.map(p => this.getPaqueteConDeuda(p));
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
        const config = this.getConfiguracion();
        
        const paquetesEjemplo = [
            { 
                codigo: 'A1', 
                clienteNombre: 'Juan Pérez', 
                clienteCelular: '76543210', 
                detalle: 'Camisa de vestir', 
                quienDejo: 'María',
                precioBase: 3,
                fechaIngreso: this._formatDate(new Date(hoy.getTime() - 2*24*60*60*1000)), 
                estado: 'pendiente' 
            },
            { 
                codigo: 'A2', 
                clienteNombre: 'María García', 
                clienteCelular: '71234567', 
                detalle: 'Vajilla de porcelana', 
                quienDejo: 'Carlos',
                precioBase: 4,
                fechaIngreso: this._formatDate(new Date(hoy.getTime() - 1*24*60*60*1000)), 
                estado: 'pendiente' 
            },
            { 
                codigo: 'A3', 
                clienteNombre: 'Pedro Rodríguez', 
                clienteCelular: '79876543', 
                detalle: 'Juguete', 
                quienDejo: 'Ana',
                precioBase: 3,
                fechaIngreso: this._formatDate(new Date(hoy.getTime() - 8*24*60*60*1000)), 
                estado: 'pendiente' 
            },
            { 
                codigo: 'A4', 
                clienteNombre: 'Ana Martínez', 
                clienteCelular: '72345678', 
                detalle: 'Maquillaje', 
                quienDejo: 'Luis',
                precioBase: 3,
                fechaIngreso: this._formatDate(new Date(hoy.getTime() - 3*24*60*60*1000)), 
                estado: 'pendiente' 
            },
            { 
                codigo: 'A5', 
                clienteNombre: 'Carlos López', 
                clienteCelular: '73456789', 
                detalle: 'Electrónicos', 
                quienDejo: 'Sofía',
                precioBase: 6,
                fechaIngreso: this._formatDate(new Date(hoy.getTime() - 10*24*60*60*1000)), 
                estado: 'pendiente' 
            }
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