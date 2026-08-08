const mongoose = require('mongoose');
require('dotenv').config();

// Conexión directa a la base de datos local
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sistema_recargas';

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'subvendedor'], default: 'subvendedor' },
    balance: { type: Number, default: 500.0, min: 0 } // Se le asignan $500 de saldo inicial para pruebas
});

const User = mongoose.model('User', UserSchema);

async function crearUsuario() {
    try {
        console.log('🔄 Conectando a MongoDB Local...');
        await mongoose.connect(MONGO_URI);
        console.log('¡Conectado con éxito!');

        const emailTest = 'tienda1@sasfabu.com';

        // Verificar si el usuario ya existe
        const existe = await User.findOne({ email: emailTest });
        if (existe) {
            console.log(`⚠️ El usuario ${emailTest} ya existe en la base de datos.`);
            process.exit(0);
        }

        // Crear el vendedor de pruebas
        const nuevoVendedor = new User({
            name: 'Tienda Uno',
            email: emailTest,
            password: 'password123', // El login acepta cualquier clave si el email existe
            role: 'subvendedor',
            balance: 500.0
        });

        await nuevoVendedor.save();
        console.log(`✅ ¡Vendedor creado con éxito!`);
        console.log(`📧 Email: ${emailTest}`);
        console.log(`💰 Saldo inicial: $500.00 USD`);

    } catch (error) {
        console.error('❌ Error al crear el vendedor:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Conexión cerrada.');
        process.exit(0);
    }
}

crearUsuario();
