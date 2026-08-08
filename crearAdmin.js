const mongoose = require('mongoose');
require('dotenv').config();

// Reemplaza esta cadena con tu enlace real de MongoDB Atlas si lo pruebas localmente
// O se leerá automáticamente de las variables de entorno si lo subes
const MONGO_URI = process.env.MONGODB_URI || 'TU_ENLACE_DE_MONGODB_ATLAS_AQUI';

// Estructura del modelo de usuario (idéntica a la de tu server.js)
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'subvendedor'], default: 'subvendedor' },
    balance: { type: Number, default: 0.0, min: 0 }
});
const User = mongoose.model('User', UserSchema);

async function inicializarAdmin() {
    try {
        console.log('🔄 Conectando a MongoDB Atlas...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conexión exitosa.');

        // Datos del Administrador Principal (Tú)
        // Puedes cambiar estos datos por el correo y nombre que tú quieras usar
        const emailAdmin = 'admin@sasfabu.com';
        const datosAdmin = {
            name: 'Juan Gabriel Berrios',
            email: emailAdmin,
            password: 'ClaveSuperSegura123*', // Tu clave de acceso al sistema
            role: 'admin',
            balance: 999999.0 // Saldo ficticio alto para el administrador
        };

        // Verificar si el usuario ya existe en la base de datos
        const usuarioExistente = await User.findOne({ email: emailAdmin });

        if (usuarioExistente) {
            console.log(`⚠️ El usuario administrador con el correo ${emailAdmin} ya existe.`);
        } else {
            const nuevoUsuario = new User(datosAdmin);
            await nuevoUsuario.save();
            console.log('🚀 ¡Usuario administrador creado con éxito en la nube!');
            console.log(`📧 Correo: ${emailAdmin}`);
        }

    } catch (error) {
        console.error('❌ Error al crear el administrador:', error.message);
    } finally {
        // Cerrar la conexión para que no se quede colgada la terminal
        await mongoose.disconnect();
        console.log('🔌 Conexión cerrada.');
    }
}

inicializarAdmin();
