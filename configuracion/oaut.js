// ============================================================
// configuracion/oaut.js — Configuración de autenticación con Google OAuth 2.0
// Usa Passport.js con la estrategia de Google para iniciar sesión
// con cuentas de Google sin manejar contraseñas manualmente.
// ============================================================

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
// Importamos el modelo de Usuario para buscar/crear usuarios en MongoDB
import { Usuario } from '../Server.js'; 

// ============================================================
// SERIALIZACIÓN Y DESERIALIZACIÓN
// Estas dos funciones le dicen a Passport cómo guardar y recuperar
// al usuario en la sesión de Express.
// ============================================================

// serializeUser: Determina qué dato se guarda en la cookie de sesión.
// Guardamos solo el _id de MongoDB (el mínimo necesario) para no inflar la cookie.
passport.serializeUser((user, done) => {
    done(null, user._id); // Guarda el ID de MongoDB en la sesión
});

// deserializeUser: Con el dato de la sesión (el _id), reconstruye el objeto completo del usuario.
// Esto se ejecuta en CADA petición para que req.user esté disponible en todos los middlewares.
passport.deserializeUser(async (id, done) => {
    try {
        const usuario = await Usuario.findById(id); // Busca al usuario en MongoDB por su _id
        done(null, usuario); // Pasa el usuario completo a req.user
    } catch (err) {
        done(err); // Si falla, Passport lo maneja como error de autenticación
    }
});

// ============================================================
// ESTRATEGIA DE GOOGLE
// Configura cómo se autentica el usuario con Google y qué hacemos
// con su información después de que Google la aprueba.
// ============================================================

passport.use(new GoogleStrategy({
    // Credenciales de la app registrada en Google Cloud Console
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    // URL a la que Google redirige tras la autenticación (debe coincidir con la registrada en Google)
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback"
  },
  // Esta función se ejecuta cuando Google aprueba el login
  // profile contiene los datos del usuario de Google
  async (accessToken, refreshToken, profile, done) => {
    // Extraemos los datos útiles del perfil de Google
    const { id, displayName, emails, photos } = profile;
    const email = emails[0].value;       // Primer email del usuario
    const foto = photos[0].value;        // URL de la foto de perfil

    // Lista blanca de admins: leemos ADMIN_EMAILS del .env
    // Formato en .env: ADMIN_EMAILS=rafa@gmail.com,otro@gmail.com
    // Normalizamos en minúsculas y sin espacios para evitar errores de comparación
    const adminEmails = (process.env.ADMIN_EMAILS || '')
        .split(',')                      // Separamos por comas
        .map(e => e.trim().toLowerCase()) // Quitamos espacios y ponemos en minúsculas
        .filter(Boolean);                // Eliminamos strings vacíos
    const esAdmin = adminEmails.includes(email.toLowerCase()); // Verificamos si el email está en la lista

    try {
        // 1. Verificar si el usuario ya existe en nuestra BD (login anterior)
        let usuario = await Usuario.findOne({ googleId: id });

        if (usuario) {
            // Caso A: Usuario existente — sincronizamos el rol
            // Esto permite cambiar quién es admin en el .env sin tocar MongoDB manualmente.
            // Al siguiente login, el rol se actualiza automáticamente.
            const nuevoRol = esAdmin ? 'admin' : 'cliente';
            if (usuario.rol !== nuevoRol) {
                usuario.rol = nuevoRol;
                await usuario.save();
                console.log(`Rol del usuario ${usuario.nombre} actualizado a ${nuevoRol}`);
            }
            console.log("Usuario existente:", usuario.nombre, "| rol:", usuario.rol);
            return done(null, usuario); // Todo bien, pasamos el usuario a Passport
        } else {
            // Caso B: Primer login — creamos el usuario en MongoDB
            const nuevoUsuario = new Usuario({
                googleId: id,           // ID único de Google (nunca cambia)
                nombre: displayName,    // Nombre completo como aparece en Google
                email: email,
                foto: foto,
                rol: esAdmin ? 'admin' : 'cliente', // Asignamos el rol desde el inicio
                carrito: []             // Carrito vacío al registrarse
            });

            await nuevoUsuario.save();
            console.log(
                `Nuevo usuario creado: ${displayName} | rol: ${nuevoUsuario.rol}`
            );
            return done(null, nuevoUsuario);
        }
    } catch (err) {
        console.error("Error en la estrategia de Google:", err);
        return done(err); // Passport maneja el error
    }
  }
));
