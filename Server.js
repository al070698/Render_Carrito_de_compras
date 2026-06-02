// ============================================================
// Server.js — Servidor principal de la tienda Funko Hunter
// Tecnologías: Express, MongoDB (Mongoose), Passport (Google OAuth),
//              Mercado Pago, AWS S3, express-fileupload
// ============================================================

// --- IMPORTACIONES ---
import 'dotenv/config';             // Carga las variables de entorno del archivo .env
import express from 'express';      // Framework web para crear el servidor y las rutas
import cors from 'cors';            // Permite que el frontend haga peticiones al backend desde otro origen
import session from 'express-session'; // Maneja las sesiones de usuario (quién está logueado)
import passport from 'passport';    // Librería de autenticación (usamos Google OAuth)
import mongoose from 'mongoose';    // ODM para conectarse y operar con MongoDB
import './configuracion/oaut.js';   // Configura la estrategia de Google en Passport
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'; // SDK oficial de Mercado Pago
import fileUpload from 'express-fileupload'; // Middleware para manejar subida de archivos
import { uploadFile, getFiles, getFile, downloadFile, getFileURL } from './public/s3.js'; // Funciones para interactuar con AWS S3
import {DATABASE} from './public/config.js'; // URL de conexión a MongoDB desde el .env

// LOG DE DEPURACIÓN — verifica que el SDK de Mercado Pago se importó correctamente
console.log("Tipo de MercadoPagoConfig:", typeof MercadoPagoConfig); 

// Variable global para el cliente de Mercado Pago
let mpClient;

// Inicializa el cliente de Mercado Pago con el access token del .env
try {
    mpClient = new MercadoPagoConfig({
        accessToken: process.env.MP_ACCESS_TOKEN
    });
    console.log("--- ¡ÉXITO! mpClient inicializado correctamente ---");
} catch (error) {
    console.error("--- ERROR AL INICIALIZAR MP: ---", error.message);
}

const app = express();
const port = process.env.PORT || 3000; // Usa el puerto del .env o el 3000 por defecto


// ============================================================
// CONEXIÓN A MONGODB
// ============================================================
// Se usa la URL almacenada en la variable DATABASE del .env
// ============================================================
const url = DATABASE;

// Conecta con MongoDB y muestra resultado en consola
mongoose.connect(url)
    .then(() => console.log("¡Conectado a MongoDB Compass!"))
    .catch(err => console.error("Error al conectar a Mongo:", err));


// ============================================================
// DEFINICIÓN DE MODELOS (Esquemas de Mongoose)
// Cada modelo corresponde a una colección en MongoDB
// ============================================================

// --- Modelo de Producto (colección: productos_funko) ---
const funkoSchema = new mongoose.Schema({
    titulo: String,       // Nombre del Funko Pop
    descripcion: String,  // Descripción del producto
    precio: Number,       // Precio unitario en MXN
    cantidad: Number,     // Stock disponible
    imagen: String,       // Nombre/key del archivo en AWS S3
    categoria: String     // <-- NUEVO: Atributo para categorizar el producto
});
const Funko = mongoose.model('productos_funko', funkoSchema);

// --- Modelo de Usuario (colección: users) ---
// Incluye el carrito de compras embebido directamente en el documento
const usuarioSchema = new mongoose.Schema({
    nombre: String,
    email: String,
    googleId: String,  // ID único que Google asigna a cada cuenta
    foto: String,      // URL de la foto de perfil de Google
    // Rol del usuario: 'cliente' (default) o 'admin'.
    // Se asigna automáticamente al loguearse, comparando el email contra
    // la lista ADMIN_EMAILS del .env (separados por coma).
    rol: { type: String, enum: ['cliente', 'admin'], default: 'cliente' },
    fecha: { type: Date, default: Date.now }, // Fecha de registro
    // Aquí vive el carrito, ya no necesitas la tabla 'carrito_compra'
    carrito: [
        {
            producto_id: { type: mongoose.Schema.Types.ObjectId, ref: 'productos_funko' }, // Referencia al producto
            titulo: String,   // Guardamos el título para mostrarlo sin hacer fetch adicional
            cantidad: Number  // Unidades del producto en el carrito
        }
    ]
});
export const Usuario = mongoose.model('users', usuarioSchema);

// --- Modelo de Compras (colección: compras) ---
// Registra cada transacción realizada en la tienda
const compraSchema = new mongoose.Schema({
    status: String,     // 'Pendiente' | 'Completado' | 'Fallido'
    productos: Array,   // Array de objetos con datos del producto (título, precio, imagen, etc.)
    cantidades: Array,  // Array paralelo de cantidades (un elemento por producto)
    total: Number,      // Total pagado (subtotal + envío)
    subtotal: Number,   // Subtotal sin envío
    envio: Number,      // Costo de envío
    direccion_envio: Object, // <-- NUEVO: Para guardar la dirección capturada
    usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'users' }, // Usuario que realizó la compra
    mp_payment_id: String,    // ID del pago en Mercado Pago (para rastreo)
    mp_preference_id: String, // ID de la preferencia de MP (generada al iniciar el pago)
    fecha: { type: Date, default: Date.now } // Fecha de la compra
});
    
const Compra = mongoose.model('compras', compraSchema);


export const Direccion = new mongoose.Schema({
    pais: String,
    nombre: String,
    apellidos: String,
    calleynumero: String,
    ColoniayReferencias: String,
    codigopostal: String,
    ciudad: String,
    estado: String,
    telefono: String
});

// ============================================================
// MIDDLEWARES GLOBALES
// ============================================================

app.use(cors());                      // Permite peticiones desde cualquier origen
app.use(express.json());              // Parsea el body de las peticiones como JSON
app.use(express.static('public'));    // Sirve los archivos estáticos de la carpeta /public

// Configuración de la sesión (necesaria para que Passport recuerde al usuario)
app.use(session({
    secret: 'secreto_funko_hunter',  // Clave para firmar la cookie de sesión
    resave: false,                   // No guarda la sesión si no hubo cambios
    saveUninitialized: true          // Guarda la sesión aunque no esté inicializada
}));
app.use(passport.initialize()); // Inicializa Passport
app.use(passport.session());    // Conecta Passport con el sistema de sesiones de Express
app.use(fileUpload({
    useTempFiles: true,         // Guarda los archivos subidos en un directorio temporal
    tempFileDir: './uploads'    // Directorio temporal para los archivos
}));


// ============================================================
// RUTAS DE NAVEGACIÓN Y AUTENTICACIÓN
// ============================================================

// 1. Ruta raíz → sirve la página de inicio
app.get('/', (req, res) => {
    res.sendFile('Index.html', { root: './public' });
});


// 2. Ruta para iniciar el flujo de inicio de sesión con Google
// Pide acceso al perfil y al email del usuario
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// 2. Ruta de callback a donde Google redirige al usuario después de que acepta
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }), // Si falla, redirige al login
  (req, res) => {
    // Si llegamos aquí, la autenticación fue exitosa
    console.log("Usuario autenticado:", req.user.nombre);
    // Redirigimos a la página principal de la tienda
    res.redirect('/Client.html'); 
  }
);

// --- Ruta para saber quién está logueado en este momento ---
// El frontend la usa para mostrar/ocultar botones de login y admin
app.get('/auth/whoami', (req, res) => {
    // Si Passport verificó al usuario, los datos están en req.user
    if (req.isAuthenticated()) {
        res.json(req.user); // Devuelve todos los datos del usuario (incluyendo carrito y rol)
    } else {
        // Si no hay nadie logueado, mandamos un error 401
        res.status(401).json({ logged: false, message: "No hay sesión activa" });
    }
});

// ============================================================
// MIDDLEWARES DE PERMISOS (usados en rutas protegidas)
// ============================================================

/**
 * Bloquea la ruta si no hay sesión activa.
 * Se llama con next() para pasar al siguiente middleware si está autenticado.
 */
function requireAuth(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) return next();
    return res.status(401).json({ error: "Debes iniciar sesión" });
}

/**
 * Bloquea la ruta si el usuario no tiene rol 'admin'.
 * Se usa en TODAS las rutas /admin/* del backend.
 * Doble verificación: primero que esté logueado, luego que sea admin.
 */
function requireAdmin(req, res, next) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: "Debes iniciar sesión" });
    }
    if (req.user.rol !== 'admin') {
        // Registra en consola el intento de acceso no autorizado
        console.warn(`Usuario ${req.user.email} intentó acceder a ruta admin sin permisos`);
        return res.status(403).json({ error: "No tienes permisos de administrador" });
    }
    next(); // Es admin, puede continuar
}

// 3. Ruta para verificar el estado de la sesión (quién está conectado)
// Versión más limpia de /auth/whoami, devuelve solo los campos necesarios para el frontend
app.get('/api/current_user', (req, res) => {
    if (req.isAuthenticated()) {
        // Enviamos los datos del usuario y su carrito integrado
        res.json({
            logged: true,
            user: {
                id: req.user._id,
                nombre: req.user.nombre,
                email: req.user.email,
                foto: req.user.foto,
                carrito: req.user.carrito || [] // Si no tiene carrito, devuelve arreglo vacío
            }
        });
    } else {
        res.json({ logged: false });
    }
});

// 4. Ruta para cerrar sesión
// Passport limpia la sesión y redirige al inicio
app.get('/auth/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/'); // Al cerrar sesión, vuelve a la página principal
    });
});


// ============================================================
// RUTAS DE PRODUCTOS
// ============================================================

// 1. Obtener todos los productos (ordenados por _id ascendente)
app.get("/productos", async (req, res) => {
    try {
        const result = await Funko.find().sort({ _id: 1 });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: "Error en MongoDB" });
    }
});

/*
// 2. Búsqueda de productos por título (equivalente a ILIKE de PostgreSQL)
// Recibe el término de búsqueda como query param: /Retorno?FunkitoBuscadito=batman
app.get("/Retorno", async (req, res) => {
    const ValorStorage = req.query.FunkitoBuscadito || ""; // Si no mandan nada, busca todos
    try {
        // MongoDB usa expresiones regulares para búsquedas de texto flexibles
        // La opción "i" hace que sea case-insensitive (no distingue mayúsculas/minúsculas)
        const result = await Funko.find({
            titulo: { $regex: ValorStorage, $options: "i" }
        }).limit(20); // Máximo 20 resultados
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: "Error en el buscador" });
    }
});
*/

// 2. Búsqueda de productos por título o categoría
app.get("/Retorno", async (req, res) => {
    const ValorStorage = req.query.FunkitoBuscadito || ""; 
    try {
        // Usamos $or para buscar coincidencias tanto en el título como en la categoría
        const result = await Funko.find({
            $or: [
                { titulo: { $regex: ValorStorage, $options: "i" } },
                { categoria: { $regex: ValorStorage, $options: "i" } }
            ]
        }).limit(20); 
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: "Error en el buscador" });
    }
});

// 3. Búsqueda de productos por categoría
// Recibe la categoría como query param: /RetornoCategoria?cat=Anime
app.get("/RetornoCategoria", async (req, res) => {
    const categoriaBuscada = req.query.cat || ""; 
    try {
        // Usamos regex con opción "i" para que sea flexible y case-insensitive
        const result = await Funko.find({
            categoria: { $regex: categoriaBuscada, $options: "i" }
        }).limit(20); // Máximo 20 resultados para no saturar la vista
        
        res.json(result);
    } catch (error) {
        console.error("Error al buscar por categoría:", error);
        res.status(500).json({ error: "Error en el buscador por categoría" });
    }
});

// ============================================================
// FLUJO DE PAGO CON MERCADO PAGO
// ============================================================
// El flujo completo es:
//
// Paso 1: El front llama a POST /pago/iniciar
//   -> Validamos el stock de cada producto con los precios REALES de la BD
//   -> Creamos una Compra con status 'Pendiente' en Mongo
//   -> Creamos una preferencia en Mercado Pago con external_reference = _id de la compra
//   -> Devolvemos la URL de pago de MP al front
//
// Paso 2: El usuario paga en el sitio de Mercado Pago
//
// Paso 3: MP redirige al usuario según el resultado:
//   -> GET /pago/exitoso  => verificamos con MP, actualizamos a 'Completado', descontamos stock
//   -> GET /pago/fallido  => actualizamos la compra a 'Fallido'
//   -> GET /pago/pendiente => dejamos en 'Pendiente' (pago en efectivo, etc.)
//
// En TODOS los casos, usamos external_reference (el _id de la compra) para
// saber qué registro de Compra actualizar.
// ============================================================

app.post("/pago/iniciar", async (req, res) => {
    // 1. Extraemos direccion_envio del req.body
    const { items, envio, direccion_envio } = req.body;

    // Solo usuarios logueados pueden pagar
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Debes iniciar sesión para pagar" });
    }

    // Validar que el carrito no esté vacío
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "No hay productos para procesar" });
    }

    try {
        // 1. Cargar los datos REALES de los productos desde la BD
        // NUNCA confiamos en el precio que manda el frontend (podría ser manipulado)
        const ids = items.map(p => p.id);
        const productosDB = await Funko.find({ _id: { $in: ids } });

        // Arrays que se usan para armar la preferencia de MP y guardar la compra
        const itemsMP = [];        // Formato que espera el SDK de Mercado Pago
        const productosCompra = []; // Datos de los productos que se guardan en la compra
        const cantidadesCompra = []; // Array paralelo de cantidades
        let subtotal = 0;

        // Recorremos cada producto del carrito del frontend
        for (const itemFront of items) {
            // Buscamos el producto en la BD por su ID de MongoDB
            const productoDB = productosDB.find(p => p._id.toString() === String(itemFront.id));
            if (!productoDB) {
                return res.status(400).json({ error: `Producto ${itemFront.id} no encontrado` });
            }

            // Cantidad que el usuario quiere comprar (compatible con diferentes nombres de campo)
            const qty = parseInt(itemFront.qty || itemFront.cantidad || 1);

            // Validar que haya suficiente stock antes de procesar el pago
            if (qty > productoDB.cantidad) {
                return res.status(400).json({
                    error: `Stock insuficiente de ${productoDB.titulo} (disponibles: ${productoDB.cantidad})`
                });pre
            }

            // Armamos el objeto en el formato que requiere el SDK de Mercado Pago
            itemsMP.push({
                title: productoDB.titulo,
                quantity: qty,
                unit_price: Number(productoDB.precio.toFixed(2)), // Precio con 2 decimales
                currency_id: 'MXN'
            });

            // Guardamos los datos completos del producto en la compra (para historial)
            productosCompra.push({
                _id: productoDB._id,
                titulo: productoDB.titulo,
                cantidad: parseInt(qty),
                precio: Number(productoDB.precio.toFixed(2)),
                imagen: productoDB.imagen
            });
            cantidadesCompra.push(String(qty));
            subtotal += productoDB.precio * qty; // Acumulamos el subtotal
        }

        const costoEnvio = Number(envio) || 0;
        const totalFinal = Number((subtotal + costoEnvio).toFixed(2));

        // Si hay costo de envío, lo agregamos como un ítem adicional en MP
        if (costoEnvio > 0) {
            itemsMP.push({
                title: 'Costo de envío',
                quantity: 1,
                unit_price: Number(costoEnvio.toFixed(2)),
                currency_id: 'MXN'
            });
        }

        // 2. Guardar la compra como PENDIENTE antes de redirigir a MP
        // Si el usuario abandona el pago, queda registro de la intención
        const nuevaCompra = new Compra({
            status: 'Pendiente',
            productos: productosCompra,
            cantidades: cantidadesCompra,
            subtotal: Number(subtotal.toFixed(2)),
            envio: costoEnvio,
            total: totalFinal,
            direccion_envio: direccion_envio, // <-- Se añade la dirección al guardar
            usuario_id: req.user._id 
        });
        await nuevaCompra.save();

        console.log(`Compra ${nuevaCompra._id} creada como Pendiente para el usuario ${req.user._id}`);

        // 3. Crear la preferencia de pago en Mercado Pago
        // external_reference es el _id de nuestra compra — con esto sabemos qué compra actualizar
        // cuando MP nos llame de vuelta
        const preference = new Preference(mpClient);
        const resultado = await preference.create({
            body: {
                items: itemsMP,
                external_reference: String(nuevaCompra._id), // Nuestro identificador interno
                back_urls: {
                    success: `https://render-carrito-de-compras.onrender.com/pago/exitoso`,
                    failure: `https://render-carrito-de-compras.onrender.com/pago/fallido`,
                    pending: `https://render-carrito-de-compras.onrender.com/pago/pendiente`
                },
                auto_return: 'approved' // MP redirige automáticamente si el pago fue aprobado
            }
        });

        // Guardamos el preference_id por si necesitamos consultarlo luego
        nuevaCompra.mp_preference_id = resultado.id;
        await nuevaCompra.save();

        // Devolvemos la URL de pago y el ID de la compra al frontend
        res.json({
            url: resultado.init_point,  // URL de Mercado Pago donde el usuario paga
            idCompra: String(nuevaCompra._id)
        });

    } catch (error) {
        console.error("Error al iniciar pago:", error);
        res.status(500).json({ error: "Error al procesar el pago", detalle: error.message });
    }
});


// ALIAS: mantiene compatibilidad con el front viejo que llamaba /crear-pago
// Redirige internamente al endpoint nuevo /pago/iniciar
app.post("/crear-pago", (req, res, next) => {
    req.url = '/pago/iniciar';
    app._router.handle(req, res, next);
});


/**
 * Callback de Mercado Pago cuando el pago es APROBADO.
 * MP envía en los query params: payment_id, status, external_reference, etc.
 * IMPORTANTE: Siempre verificamos con la API de MP, nunca confiamos solo en los params
 * (cualquiera podría entrar a esta URL manualmente con params falsos).
 */
app.get("/pago/exitoso", async (req, res) => {
    const { payment_id, status, external_reference } = req.query;
    console.log("Callback éxito MP:", req.query);

    try {
        // external_reference contiene el _id de nuestra compra en MongoDB
        if (!external_reference) {
            return res.redirect('/pago-resultado.html?ok=false&motivo=sin_referencia');
        }

        // 1. Buscar la compra en nuestra BD usando el external_reference
        const compra = await Compra.findById(external_reference);
        if (!compra) {
            return res.redirect('/pago-resultado.html?ok=false&motivo=compra_no_encontrada');
        }

        // Si ya está completada, no la procesamos de nuevo (previene procesamiento duplicado)
        if (compra.status === 'Completado') {
            return res.redirect(
                `/pago-resultado.html?ok=true&compra=${compra._id}&duplicado=true`
            );
        }

        // 2. Verificar con la API de MP que el pago realmente fue aprobado
        // Esto es CRÍTICO para la seguridad: no basta con que los query params digan "approved"
        let pagoMP = null;
        if (payment_id) {
            try {
                const mpPayment = new Payment(mpClient);
                pagoMP = await mpPayment.get({ id: payment_id });
                console.log("Pago MP verificado, status:", pagoMP.status);
            } catch (err) {
                console.warn("No se pudo verificar el pago con MP:", err.message);
            }
        }

        // 3. Determinamos si el pago fue aprobado
        // Si MP responde, usamos su status; si no, caemos al status del query param
        const aprobado = pagoMP ? pagoMP.status === 'approved' : (status === 'approved');

        if (!aprobado) {
            // El pago no fue aprobado — marcamos la compra como Fallida
            compra.status = 'Fallido';
            await compra.save();
            return res.redirect(
                `/pago-resultado.html?ok=false&motivo=no_aprobado&compra=${compra._id}`
            );
        }

        // 4. Descontar el stock de cada producto comprado
        // Usamos findOneAndUpdate con $gte para evitar condiciones de carrera
        // (si dos pagos llegan al mismo tiempo, solo uno puede descontar si hay stock)
        for (let i = 0; i < compra.productos.length; i++) {
            const idProd = compra.productos[i]._id || compra.productos[i];
            const qty = parseInt(compra.cantidades[i]) || 0;
            // Operación atómica: solo descuenta si la cantidad disponible es >= qty
            const actualizado = await Funko.findOneAndUpdate(
                { _id: idProd, cantidad: { $gte: qty } },
                { $inc: { cantidad: -qty } }, // Decrementa el stock
                { new: true }
            );
            if (!actualizado) {
                console.warn(`No se pudo descontar stock del producto ${idProd} (puede que ya no haya)`);
            }
        }

        // 5. Vaciar el carrito del usuario después de la compra exitosa
        await Usuario.findByIdAndUpdate(compra.usuario_id, { $set: { carrito: [] } });

        // 6. Marcar la compra como Completada y guardar el payment_id de MP
        compra.status = 'Completado';
        if (payment_id) compra.mp_payment_id = String(payment_id);
        await compra.save();

        console.log(`Compra ${compra._id} marcada como Completado`);

        return res.redirect(`/pago-resultado.html?ok=true&compra=${compra._id}`);

    } catch (error) {
        console.error("Error al procesar pago exitoso:", error);
        return res.redirect('/pago-resultado.html?ok=false&motivo=error_servidor');
    }
});


/**
 * Callback de MP cuando el pago es RECHAZADO.
 * Marcamos la compra como 'Fallido' en nuestra BD.
 */
app.get("/pago/fallido", async (req, res) => {
    const { external_reference } = req.query;
    console.log("Callback fallido MP:", req.query);

    try {
        if (external_reference) {
            const compra = await Compra.findById(external_reference);
            // Solo actualizamos si todavía está Pendiente (podría haber sido procesada antes)
            if (compra && compra.status === 'Pendiente') {
                compra.status = 'Fallido';
                await compra.save();
                console.log(`Compra ${compra._id} marcada como Fallido`);
            }
            return res.redirect(
                `/pago-resultado.html?ok=false&motivo=pago_rechazado&compra=${external_reference}`
            );
        }
        return res.redirect('/pago-resultado.html?ok=false&motivo=pago_rechazado');
    } catch (error) {
        console.error("Error al marcar compra fallida:", error);
        return res.redirect('/pago-resultado.html?ok=false&motivo=error_servidor');
    }
});


/**
 * Callback de MP cuando el pago queda PENDIENTE.
 * Ocurre con métodos de pago en efectivo (OXXO, etc.) que demoran en procesarse.
 * No cambiamos el status porque ya está 'Pendiente' desde que se creó.
 */
app.get("/pago/pendiente", async (req, res) => {
    const { external_reference } = req.query;
    console.log("Callback pendiente MP:", req.query);

    return res.redirect(
        `/pago-resultado.html?ok=pending&compra=${external_reference || ''}`
    );
});

// ============================================================
// RUTAS DEL CARRITO
// ============================================================

/**
 * POST /carrito/detalle
 * Recibe un array de items {id, cantidad} y devuelve los detalles
 * de cada producto con precios reales de la BD.
 * El frontend la usa para renderizar el sidebar del carrito y validar stock.
 */
app.post("/carrito/detalle", async (req, res) => {
    const { items } = req.body || {};
    
    if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Formato inválido: se esperaba un array de items" });
    }

    try {
        const detalle = [];
        let total = 0;
        const advertencias = []; // Mensajes de stock insuficiente para mostrar al usuario

        for (const item of items) {
            const p = await Funko.findById(item.id); // Buscamos el producto en BD

            if (!p) {
                // El producto ya no existe en el catálogo
                advertencias.push(`El Funko con ID ${item.id} ya no está disponible en nuestro catálogo`);
                continue; // Saltamos este producto
            }

            const cantSolicitada = Number(item.qty || item.cantidad) || 0;
            const subtotal = p.precio * cantSolicitada;
            total += subtotal;

            detalle.push({
                id: p._id,
                titulo: p.titulo,
                precio_unitario: p.precio,
                cantidad: cantSolicitada,
                subtotal: Number(subtotal.toFixed(2)),
                imagen: p.imagen,
                stock_disponible: p.cantidad, // 'p.cantidad' en el esquema es el stock
                stock_ok: cantSolicitada <= p.cantidad // false si el usuario pide más de lo disponible
            });

            // Avisamos si el usuario pide más unidades de las que hay
            if (cantSolicitada > p.cantidad) {
                advertencias.push(`${p.titulo}: Solo quedan ${p.cantidad} unidades disponibles.`);
            }
        }

        res.json({
            items: detalle,
            total: Number(total.toFixed(2)),
            advertencias
        });

    } catch (error) {
        console.error("Error en detalle carrito:", error);
        res.status(500).json({ error: "Error interno", mensaje: error.message });
    }
});

// Obtener un solo producto por su ID de MongoDB
app.get("/productos/:id", async (req, res) => {
    try {
        const producto = await Funko.findById(req.params.id);
        res.json(producto);
    } catch (error) {
        res.status(404).json({ error: "Producto no encontrado" });
    }
});

// 3. Cargar el carrito de un usuario específico desde MongoDB
// Requiere que el usuario esté autenticado
app.get("/CargarCarrito/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "No logueado" });
    }

    try {
        const userId = req.params.id; // ID del usuario recibido en la URL
        // Solo pedimos el campo 'carrito', sin el _id del usuario (optimización)
        const usuario = await Usuario.findById(userId, { carrito: 1, _id: 0 });

        if (!usuario) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        res.json(usuario.carrito || []);
    } catch (error) {
        console.error("Error al cargar carrito:", error);
        res.status(500).json({ error: "Error interno al cargar carrito" });
    }
});


// 4. Guardar/actualizar el carrito de un usuario en MongoDB
// Reemplaza el carrito completo del usuario con el array que manda el frontend
app.post("/ActualizarCarritoDB", async (req, res) => {
    const { items, idUsuario } = req.body; 

    // Validamos que lleguen los datos necesarios
    if (!idUsuario || !Array.isArray(items)) {
        return res.status(400).json({ error: "Datos insuficientes o formato inválido" });
    }

    // Normalizamos los items para que coincidan con el esquema de carrito de Mongoose
    // El frontend puede enviar qty o cantidad — aquí unificamos como 'cantidad'
    const itemsNormalizados = items.map(i => ({
        producto_id: i.id,    // En el esquema de Mongoose es 'producto_id'
        titulo: i.titulo,      
        cantidad: Number(i.qty || i.cantidad), // Aceptamos 'qty' o 'cantidad'
    }));

    try {
        // $set reemplaza el array completo del carrito (no agrega, reemplaza)
        const usuario = await Usuario.findByIdAndUpdate(
            idUsuario, 
            { $set: { carrito: itemsNormalizados } }, 
            { new: true, runValidators: true } // runValidators verifica que el esquema se respete
        );

        if (!usuario) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        res.json(usuario.carrito); // Devuelve el carrito actualizado
    } catch (error) {
        console.error("Error al actualizar carrito en DB:", error);
        res.status(500).json({ error: "Error al guardar carrito", detalle: error.message });
    }
});

// ============================================================
// RUTAS DE COMPRAS DEL USUARIO
// ============================================================

/**
 * GET /MisCompras
 * Devuelve todas las compras del usuario logueado, ordenadas de más reciente a más antigua.
 * Los datos de los productos ya van embebidos en cada compra, así que el frontend
 * no necesita hacer fetches adicionales por producto.
 */
app.get("/MisCompras", async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "No logueado" });
    }

    try {
        // Buscamos todas las compras de este usuario, ordenadas de más nueva a más vieja
        const compras = await Compra.find({ usuario_id: req.user._id })
            .sort({ fecha: -1 });

        // Construimos el objeto de respuesta con los datos que necesita el frontend
        const comprasConDetalle = await Promise.all(compras.map(async (compra) => {
            return {
                _id: compra._id,
                status: compra.status,
                total: compra.total,
                subtotal: compra.subtotal,
                envio: compra.envio,
                fecha: compra.fecha,
                mp_payment_id: compra.mp_payment_id,
                productos: compra.productos // Ya vienen embebidos en el documento de Compra
            };
        }));

        res.json(comprasConDetalle);
    } catch (error) {
        console.error("Error al cargar compras del usuario:", error);
        res.status(500).json({ error: "Error al cargar las compras" });
    }
});


// Alias del endpoint antiguo — no se debe usar desde el frontend actual.
// El guardado ahora lo hace automáticamente el callback /pago/exitoso.
// Se mantiene por compatibilidad con código viejo.
app.post("/GuardarCompra", async (req, res) => {
    const { Status, Productos, Cantidades, Total, id } = req.body;
    try {
        const nuevaCompra = new Compra({
            status: Status,
            productos: Productos,
            cantidades: Cantidades,
            total: Total,
            usuario_id: id
        });
        await nuevaCompra.save();
        res.status(201).json(nuevaCompra);
    } catch (error) {
        res.status(500).json({ error: "Error al guardar compra" });
    }
});


// ============================================================
// ENDPOINTS DE ADMINISTRACIÓN (/admin/*)
// ============================================================
// Todos estos endpoints pasan por el middleware requireAdmin, que
// verifica que el usuario esté logueado Y tenga rol 'admin'.
// No basta con esconder el botón en el frontend — la protección real está aquí.
// ============================================================

// --- PRODUCTOS (CRUD de admin) ---

/**
 * GET /admin/productos
 * Lista TODOS los productos del catálogo (sin filtrar agotados).
 * Ordenados alfabéticamente por título.
 */
app.get("/admin/productos", requireAdmin, async (req, res) => {
    try {
        const productos = await Funko.find().sort({ titulo: 1 });
        res.json(productos);
    } catch (error) {
        console.error("Error al listar productos (admin):", error);
        res.status(500).json({ error: "Error en la base de datos" });
    }
});

/**
 * POST /admin/productos
 * Crea un nuevo producto en el catálogo.
 * Body requerido: { titulo, precio, cantidad, descripcion, imagen }
 */
app.post("/admin/productos", requireAdmin, async (req, res) => {
    const { titulo, precio, cantidad, descripcion, imagen, categoria } = req.body;
    try {
        // Validamos los campos obligatorios antes de guardar
        if (!titulo || precio == null || cantidad == null) {
            return res.status(400).json({ error: "titulo, precio y cantidad son obligatorios" });
        }
        const nuevo = new Funko({
            titulo,
            precio: Number(precio),
            cantidad: parseInt(cantidad),
            descripcion: descripcion || '', // Si no viene descripción, guardamos string vacío
            imagen: imagen || '', // Si no viene imagen, guardamos string vacío
            categoria: categoria || '' // 2. Le decimos que lo guarde en Mongo
        });
        await nuevo.save();
        console.log(`[Admin ${req.user.email}] Creó producto: ${titulo}`);
        res.status(201).json(nuevo); // 201 = Created
    } catch (error) {
        console.error("Error al crear producto:", error);
        res.status(500).json({ error: "No se pudo crear el producto", detalle: error.message });
    }
});

/**
 * PUT /admin/productos/:id
 * Actualiza los datos de un producto existente.
 * Solo actualiza los campos que vienen en el body (actualización parcial).
 */
app.put("/admin/productos/:id", requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { titulo, precio, cantidad, descripcion, imagen, categoria } = req.body;
    try {
        // Construimos el objeto de cambios solo con los campos que llegaron
        const cambios = {};
        if (titulo !== undefined) cambios.titulo = titulo;
        if (precio !== undefined) cambios.precio = Number(precio);
        if (cantidad !== undefined) cambios.cantidad = parseInt(cantidad);
        if (descripcion !== undefined) cambios.descripcion = descripcion;
        if (imagen !== undefined) cambios.imagen = imagen;
        if (categoria !== undefined) cambios.categoria = categoria; // 2. Registramos el cambio

        // { new: true } devuelve el documento actualizado, no el original
        const actualizado = await Funko.findByIdAndUpdate(id, cambios, { new: true });
        if (!actualizado) return res.status(404).json({ error: "Producto no encontrado" });

        console.log(`[Admin ${req.user.email}] Editó producto ${id}`);
        res.json(actualizado);
    } catch (error) {
        console.error("Error al editar producto:", error);
        res.status(500).json({ error: "No se pudo editar el producto", detalle: error.message });
    }
});

/**
 * DELETE /admin/productos/:id
 * Elimina un producto y lo remueve de TODOS los carritos de usuarios.
 * Pasos:
 *  1. Valida que el ID sea un ObjectId válido de MongoDB
 *  2. Elimina el producto de la colección de Funkos
 *  3. Limpia el producto de los carritos de todos los usuarios que lo tenían
 */
app.delete("/admin/productos/:id", requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        // 1. Validar que el ID sea un ObjectId válido antes de operar
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "ID de producto no válido" });
        }

        // 2. Eliminar el producto de la colección Funkos
        const eliminado = await Funko.findByIdAndDelete(id);
        
        if (!eliminado) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }

        // 3. Limpiar el producto de los carritos de TODOS los usuarios
        // Convertimos el id (String) a ObjectId para que el $pull funcione correctamente
        const objectId = new mongoose.Types.ObjectId(id);

        const resultadoLimpieza = await Usuario.updateMany(
            { "carrito.producto_id": objectId }, // Usuarios que tengan ese producto en su carrito
            { 
                $pull: { 
                    carrito: { producto_id: objectId } // Elimina el elemento del array
                } 
            }
        );

        console.log(`[Admin ${req.user.email}] Eliminó producto: ${eliminado.titulo}`);
        console.log(`Se removió de ${resultadoLimpieza.modifiedCount} carritos.`);

        res.json({ 
            ok: true, 
            mensaje: "Producto eliminado y carritos actualizados",
            eliminado  // Devolvemos el producto eliminado por referencia
        });

    } catch (error) {
        console.error("Error al eliminar producto:", error);
        res.status(500).json({ error: "No se pudo eliminar el producto" });
    }
});

// --- COMPRAS (vista de admin) ---

/**
 * GET /admin/compras
 * Lista TODAS las compras de TODOS los usuarios.
 * Incluye los datos del usuario (nombre, email, foto) gracias a populate().
 * Soporta filtrado opcional por status: /admin/compras?status=Completado
 */
app.get("/admin/compras", requireAdmin, async (req, res) => {
    try {
        let productosCompra = [];
        const filtro = {};
        if (req.query.status) filtro.status = req.query.status; // Filtro opcional por status

        // populate() trae los datos del usuario referenciado en usuario_id
        const compras = await Compra.find(filtro)
            .populate('usuario_id', 'nombre email foto') // Solo traemos nombre, email y foto
            .sort({ fecha: -1 }); // Ordenadas de más nueva a más vieja

        // Construimos el objeto de respuesta con estructura limpia para el frontend del admin
        const enriquecidas = await Promise.all(compras.map(async (c) => {
            return {
                _id: c._id,
                status: c.status,
                total: c.total,
                subtotal: c.subtotal,
                envio: c.envio,
                fecha: c.fecha,
                mp_payment_id: c.mp_payment_id,
                usuario: c.usuario_id ? {
                    nombre: c.usuario_id.nombre,
                    email: c.usuario_id.email,
                    foto: c.usuario_id.foto
                } : null, // null si el usuario fue eliminado
                productos: c.productos
            };
        }));

        res.json(enriquecidas);
    } catch (error) {
        console.error("Error al listar compras (admin):", error);
        res.status(500).json({ error: "Error al cargar compras" });
    }
});

/**
 * GET /admin/stats
 * Devuelve un resumen con métricas clave para el dashboard del panel de administración:
 * - Total de productos en catálogo
 * - Total de compras registradas
 * - Compras completadas
 * - Productos agotados (stock = 0)
 * - Suma total de ventas completadas
 */
app.get("/admin/stats", requireAdmin, async (req, res) => {
    try {
        // Ejecutamos todas las consultas en paralelo con Promise.all para mayor eficiencia
        const [totalProductos, totalCompras, comprasCompletadas, agotados] = await Promise.all([
            Funko.countDocuments(),                           // Todos los productos
            Compra.countDocuments(),                          // Todas las compras
            Compra.countDocuments({ status: 'Completado' }), // Solo las completadas
            Funko.countDocuments({ cantidad: 0 })             // Productos sin stock
        ]);

        // Usamos aggregate para sumar el total de ventas completadas
        const ventasAgg = await Compra.aggregate([
            { $match: { status: 'Completado' } }, // Solo compras completadas
            { $group: { _id: null, total: { $sum: '$total' } } } // Suma del campo 'total'
        ]);
        const ventasTotales = ventasAgg.length > 0 ? ventasAgg[0].total : 0;

        res.json({
            totalProductos,
            totalCompras,
            comprasCompletadas,
            productosAgotados: agotados,
            ventasTotales: Number(ventasTotales.toFixed(2))
        });
    } catch (error) {
        console.error("Error al obtener stats:", error);
        res.status(500).json({ error: "Error al obtener estadísticas" });
    }
});


// ============================================================
// RUTAS DE MANEJO DE ARCHIVOS (AWS S3)
// ============================================================

// Sube un archivo al bucket de S3
// El archivo llega como multipart/form-data gracias a express-fileupload
app.post("/files", async (req, res)=>{
    const archivo = req.files.file;
    await uploadFile(archivo); // Función definida en s3.js
    // Devuelve la key (nombre) del archivo para guardarlo en la BD como referencia
    res.json({ message: "Archivo subido correctamente", key: archivo.name });
});


// Lista todos los objetos almacenados en el bucket de S3
app.get('/files', async (req, res) =>{
    const result = await getFiles();
    res.json(result.Contents) // Devuelve el array de objetos del bucket
});


// Descarga un archivo de S3 al servidor (guarda en ./images/)
app.get('/downloadfile/:fileName', async (req, res) =>{
    await downloadFile(req.params.fileName);
    res.json({message: "Archivo descargado correctamente"});
})


// Genera y devuelve una URL prefirmada (signed URL) de S3 para un archivo
// La URL expira en 1 hora y permite al frontend acceder a archivos privados del bucket
app.get('/files/:fileName', async (req, res) =>{
    const result = await getFileURL(req.params.fileName);
    console.log("key solicitada:", req.params.fileName);
    res.json({
        url: result // URL temporal con acceso al archivo en S3
    })
})



app.use(express.static('images')); // También sirve archivos de la carpeta /images


// Inicia el servidor en el puerto configurado
app.listen(port, () => console.log(`Servidor en http://localhost:${port}`));
