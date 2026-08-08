class ReloadlyService {
    constructor() {
        this.clientId = process.env.RELOADLY_CLIENT_ID;
        this.clientSecret = process.env.RELOADLY_CLIENT_SECRET;
        this.audience = process.env.RELOADLY_AUDIENCE;
    }

    // 1. SIMULADOR DE TOKEN DE ACCESO
    async obtenerToken() {
        console.log('🔑 MODO PRUEBAS ACTIVO: Saltando autenticación real de Reloadly.');
        return "TOKEN_SIMULADO_PROVEEDOR_LOCAL";
    }

    // 2. SIMULADOR DE DETECCIÓN DE OPERADOR
    async detectarOperador(numeroCelular, codigoPais) {
        console.log(`🔍 MODO PRUEBAS: Detectando operador simulado para +${codigoPais}${numeroCelular}`);
        return {
            operatorId: 1001,
            name: "WOM Chile (Test)",
            country: { name: "Chile" },
            logoUrls: ["https://placeholder.com"],
            amountType: "FIXED"
        };
    }

    // 3. SIMULADOR DE ENVÍO DE RECARGA INTERNACIONAL REAL
    async enviarRecarga(operatorId, monto, numeroCelular, codigoPais) {
        console.log(`🚀 MODO PRUEBAS: Enviando recarga virtual de $${monto} al número +${codigoPais}${numeroCelular}`);

        // Simula una respuesta exitosa idéntica a la estructura de Reloadly
        return {
            transactionId: `TX_RELOADLY_${Date.now()}`,
            status: "SUCCESS",
            montoProcesado: monto,
            fecha: new Date()
        };
    }
}

module.exports = new ReloadlyService();
