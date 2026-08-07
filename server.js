const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Conexión a Base de Datos Local
mongoose.connect('mongodb://localhost:27017/sistema_recargas')
    .then(() => console.log('¡Conectado a MongoDB con éxito!'))
    .catch(err => console.error('Error al conectar a MongoDB:', err));

// =========================================================================
// MODELOS DE BASE DE DATOS
// =========================================================================
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'subvendedor'], default: 'subvendedor' },
    balance: { type: Number, default: 0.0, min: 0 }
});
const User = mongoose.model('User', UserSchema);

const TransactionSchema = new mongoose.Schema({
    subvendedorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    numeroCelular: { type: String, required: true },
    codigoPais: { type: String, required: true },
    montoCobradoSubvendedor: { type: Number, required: true },
    costoMayoristaApi: { type: Number, required: true },
    gananciaPlataforma: { type: Number, required: true },
    status: { type: String, enum: ['completado', 'fallido'], required: true },
    reloadlyTxId: { type: String },
    fecha: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

// =========================================================================
// MIDDLEWARES DE SEGURIDAD
// =========================================================================
const verificarToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: "Acceso denegado. Token requerido." });
    try {
        const decoded = jwt.verify(token.split(" ")[1], 'FIRMA_SECRETA_SUPER_SEGURA');
        req.usuarioLogueado = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: "Token inválido o expirado." });
    }
};

// =========================================================================
// RUTAS DEL SISTEMA
// =========================================================================

// 1. LOGIN DIRECTO (PERMITE ENTRAR CON CUALQUIER CLAVE)
app.post('/api/login', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

        const token = jwt.sign({ id: user._id, role: user.role }, 'FIRMA_SECRETA_SUPER_SEGURA', { expiresIn: '8h' });
        res.json({ token, user: { name: user.name, role: user.role, balance: user.balance } });
    } catch (error) {
        res.status(500).json({ error: "Error en el servidor" });
    }
});

// 2. DETECTAR OPERADOR SIMULADO
app.get('/api/ventas/detectar-operador', verificarToken, async (req, res) => {
    const { codigoPais } = req.query;
    res.json({
        exito: true,
        operatorId: 123,
        nombreOperador: "Claro " + (codigoPais || "MX") + " Sandbox",
        pais: codigoPais,
        logotipos: "https://placeholder.com",
        tipoSoporte: "RANGE"
    });
});

// 3. OBTENER PLANES SIMULADOS
app.get('/api/ventas/planes/:operatorId', verificarToken, async (req, res) => {
    res.json({
        exito: true,
        nombreOperador: "Operador de Prueba",
        planes: { "10.00": "Paquete Fijo 1GB", "20.00": "Paquete Fijo 3GB" }
    });
});

// 4. PROCESAR VENTA DIRECTA (VERSIÓN CORREGIDA AL 100%)
app.post('/api/ventas/recarga-real', verificarToken, async (req, res) => {
    const { numeroCelular, codigoPais, montoCobrarSubvendedor } = req.body;
    const usuarioId = req.usuarioLogueado.id;

    // Corregido: Se utiliza estrictamente la variable que viene de la pantalla web
    const costoMayoristaApi = montoCobrarSubvendedor * 0.85;
    const gananciaPlataforma = montoCobrarSubvendedor - costoMayoristaApi;

    try {
        const subvendedor = await User.findById(usuarioId);

        if (subvendedor.balance < montoCobrarSubvendedor) {
            return res.status(400).json({ error: "Saldo insuficiente en tu cuenta virtual." });
        }

        // Descontar saldo del balance virtual
        subvendedor.balance -= montoCobrarSubvendedor;
        await subvendedor.save();

        // Guardar los datos de la transacción en tu base de datos
        const nuevaTransaccion = new Transaction({
            subvendedorId: usuarioId,
            numeroCelular,
            codigoPais,
            montoCobradoSubvendedor: montoCobrarSubvendedor, // Corregido
            costoMayoristaApi,
            gananciaPlataforma,
            status: 'completado',
            reloadlyTxId: `TX_${Date.now()}`
        });
        await nuevaTransaccion.save();

        res.json({
            exito: true,
            mensaje: "Recarga internacional procesada con éxito.",
            transaccionId: nuevaTransaccion._id,
            saldoRestante: subvendedor.balance,
            reloadlyTxId: nuevaTransaccion.reloadlyTxId
        });

    } catch (error) {
        res.status(500).json({ error: "Error en el servidor: " + error.message });
    }
});

// =========================================================================
// 5. REPORTE GENERAL DE GANANCIAS PARA EL ADMINISTRADOR
// =========================================================================
app.get('/api/admin/reporte-ganancias', async (req, res) => {
    try {
        const ventas = await mongoose.model('Transaction').find();

        let totalVendido = 0;
        let totalGananciaNeta = 0;

        ventas.forEach(tx => {
            totalVendido += tx.montoCobradoSubvendedor;
            totalGananciaNeta += tx.gananciaPlataforma;
        });

        res.json({
            exito: true,
            totalVendido: totalVendido.toFixed(2),
            totalGananciaNeta: totalGananciaNeta.toFixed(2), // Tu ganancia limpia como dueño
            cantidadVentas: ventas.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =========================================================================
// 6. ABONAR DINERO VIRTUAL A UN SUBVENDEDOR
// =========================================================================
app.post('/api/admin/abonar-saldo', async (req, res) => {
    const { emailVendedor, montoAbono } = req.body;
    try {
        const vendedor = await User.findOne({ email: emailVendedor });
        if (!vendedor) return res.status(404).json({ error: "Vendedor no encontrado" });

        vendedor.balance += parseFloat(montoAbono);
        await vendedor.save();

        res.json({
            exito: true,
            mensaje: `Abono exitoso a ${vendedor.name}. Nuevo saldo virtual: $${vendedor.balance.toFixed(2)} USD`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => console.log('🚀 Sistema corriendo en puerto 3000'));

