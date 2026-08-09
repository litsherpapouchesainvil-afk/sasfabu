const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const reloadlyService = require('./reloadlyService');

const app = express();
app.use(cors());
app.use(express.json());

// Servir archivos estáticos desde la raíz y desde la carpeta public
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// Conexión a Base de Datos en la Nube / Local
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sistema_recargas';
const JWT_SECRET = process.env.JWT_SECRET || 'FIRMA_SECRETA_SUPER_SEGURA';
const PORT = process.env.PORT || 3000;

console.log('🚀 Modo Nube Activo: Servidor simulado listo para Render.');

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
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ error: "Acceso denegado. Token requerido." });

    try {
        const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;
        const decoded = jwt.verify(token, JWT_SECRET);
        req.usuarioLogueado = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: "Token inválido o expirado." });
    }
};

// =========================================================================
// RUTAS DEL SISTEMA
// =========================================================================

// Ruta raíz explícita en lugar de un comodín (*) erróneo
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. LOGIN DIRECTO
app.post('/api/login', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, user: { name: user.name, role: user.role, balance: user.balance } });
    } catch (error) {
        res.status(500).json({ error: "Error en el servidor" });
    }
});

// 2. DETECTAR OPERADOR REAL CON RELOADLY
app.get('/api/ventas/detectar-operador', verificarToken, async (req, res) => {
    const { numeroCelular, codigoPais } = req.query;

    if (!numeroCelular || !codigoPais) {
        return res.status(400).json({ error: "Número de celular y código de país son requeridos." });
    }

    try {
        const operador = await reloadlyService.detectarOperador(numeroCelular, codigoPais);
        res.json({
            exito: true,
            operatorId: operador.operatorId,
            nombreOperador: operador.name,
            pais: operador.country.name,
            logotipos: operador.logoUrls && operador.logoUrls.length > 0 ? operador.logoUrls : "https://placeholder.com",
            tipoSoporte: operador.amountType
        });
    } catch (error) {
        res.status(500).json({ error: "Error al detectar el operador: " + (error.response?.data?.message || error.message) });
    }
});

// 3. OBTENER PLANES SIMULADOS
app.get('/api/ventas/planes/:operatorId', verificarToken, async (req, res) => {
    res.json({
        exito: true,
        nombreOperador: "Operador de Prueba",
        planes: { "10.00": "Paquete Fijo 1GB", "20.00": "Paquete Fijo 3GB" }
    });
});

// 4. PROCESAR VENTA REAL INTEGRADA CON LA API
app.post('/api/ventas/recarga-real', verificarToken, async (req, res) => {
    const { operatorId, numeroCelular, codigoPais, montoCobradoSubvendedor } = req.body;
    const usuarioId = req.usuarioLogueado.id;

    // Asegurar que el monto sea un número válido
    const monto = parseFloat(montoCobradoSubvendedor);
    if (isNaN(monto) || monto <= 0) {
        return res.status(400).json({ error: "El monto ingresado no es válido." });
    }

    const costoMayoristaApi = monto * 0.85;
    const gananciaPlataforma = monto - costoMayoristaApi;

    try {
        const subvendedor = await User.findById(usuarioId);
        if (!subvendedor) {
            return res.status(404).json({ error: "Vendedor no encontrado en el sistema." });
        }

        // Validación estricta de saldo disponible
        if (subvendedor.balance < monto) {
            return res.status(400).json({ error: `Saldo insuficiente. Tu saldo es: $${subvendedor.balance.toFixed(2)} USD` });
        }

        // Llamar al simulador local de Reloadly
        const respuestaReloadly = await reloadlyService.enviarRecarga(operatorId, costoMayoristaApi, numeroCelular, codigoPais);

        // Descontar el dinero de forma segura
        subvendedor.balance = parseFloat((subvendedor.balance - monto).toFixed(2));
        await subvendedor.save();

        const nuevaTransaccion = new Transaction({
            subvendedorId: usuarioId,
            numeroCelular,
            codigoPais,
            montoCobradoSubvendedor: monto,
            costoMayoristaApi,
            gananciaPlataforma,
            status: 'completado',
            reloadlyTxId: respuestaReloadly.transactionId || `TX_${Date.now()}`
        });
        await nuevaTransaccion.save();

        res.json({
            exito: true,
            mensaje: "Recarga internacional procesada y enviada con éxito.",
            transaccionId: nuevaTransaccion._id,
            saldoRestante: subvendedor.balance,
            reloadlyTxId: nuevaTransaccion.reloadlyTxId
        });

    } catch (error) {
        console.error("Fallo en el proceso de venta:", error);
        res.status(500).json({ error: "Error al procesar la recarga: " + error.message });
    }
});
