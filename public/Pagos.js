// ============================================================
// public/Pagos.js — Lógica de la página de checkout (Pagos.html)
// Maneja: autenticación, resumen del carrito y proceso de pago con Mercado Pago.
// ============================================================

// --- VARIABLES GLOBALES ---
let idUser;     // ID de MongoDB del usuario logueado
let carrito;    // Array con los items del carrito cargados desde MongoDB
let TotalGLOB;  // Total final (subtotal + envío) — se usa al llamar a Mercado Pago

// ============================================================
// INICIALIZACIÓN
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const homeIcon = document.getElementById('home-icon');

    if (homeIcon) homeIcon.onclick = () => window.location.href = 'Client.html';

    checkAuth(); // Verifica sesión y carga el carrito del usuario si está logueado
});

// ============================================================
// AUTENTICACIÓN
// ============================================================

/**
 * Verifica si hay sesión activa consultando al servidor.
 * Si el usuario está logueado, carga su carrito y muestra el resumen del checkout.
 */
async function checkAuth() {
    try {
        const loginBtn = document.getElementById('login-btn');
        const userInfo = document.getElementById('user-info');
        const userPhoto = document.getElementById('user-photo');
        const userName = document.getElementById('user-name');
        const response = await fetch('/auth/whoami'); // Pregunta al servidor quién está logueado

        if (response.ok) {
            const user = await response.json();
            idUser = user._id; // ID de MongoDB del usuario

            // Mostramos la info del usuario y ocultamos el botón de login
            loginBtn.classList.add('hidden');
            userInfo.classList.remove('hidden');
            
            // Rellenamos la UI con los datos de Google
            userPhoto.src = user.foto;
            userName.textContent = user.nombre.split(' ')[0]; // Solo el primer nombre

            // Si es admin, mostramos el enlace al panel de administración
            const adminLink = document.getElementById('admin-link');
            if (adminLink && user.rol === 'admin') {
                adminLink.classList.remove('hidden');
            }
            
            // Si el usuario tiene carrito guardado en MongoDB, lo cargamos
            if (user.carrito && user.carrito.length > 0) {
                // Convertimos del formato de MongoDB al formato local del script
                carrito = user.carrito.map(item => ({
                    id: item.producto_id,
                    titulo: item.titulo,
                    qty: item.cantidad
                }));
                await cargarResumenCheckout(); // Mostramos el resumen del carrito
                console.log("carrito", carrito); 
            }
        }
    } catch (error) {
        console.log("Sesión no iniciada", error);
    }
}


/**
 * Cierra la sesión del usuario llamando al endpoint /auth/logout del servidor.
 */
async function CerrarCarrito(){
    try{
        fetch('/auth/logout', {
        method: 'GET',
        credentials: 'include' // Enviamos las cookies de sesión para que el servidor identifique al usuario
        })
        .then(response => {
            if (response.redirected) {
            window.location.href = response.url; // Seguimos la redirección del servidor
            } else if (response.ok) {
            console.log('Logout exitoso');
            } else {
            console.error('Error al cerrar sesión');
            }
        })
        .catch(error => {
            console.error('Error en la petición:', error);
        });
    }catch(error){
        console.log("error al guardar el carrito actualizado en la base");
    }
}


// ============================================================
// RESUMEN DEL CHECKOUT
// ============================================================

/**
 * Carga y renderiza el resumen de compra con los productos del carrito.
 * Consulta al servidor los precios y stock reales (no confía en datos locales).
 * Muestra advertencias si hay productos con stock insuficiente.
 */
async function cargarResumenCheckout() {
    const contenedor = document.getElementById('lista-checkout');
    if (!contenedor) return;

    // Si el carrito está vacío, mostramos un mensaje y deshabilitamos el botón de pago
    if (!carrito || carrito.length === 0) {
        contenedor.innerHTML = `
            <div style="padding:2rem; text-align:center; color:#666;">
                <i class="bi bi-bag-x" style="font-size:2rem;"></i>
                <p style="margin-top:1rem;">Tu carrito está vacío</p>
                <a href="Client.html" style="color:#111; text-decoration:underline;">Volver al catálogo</a>
            </div>
        `;
        actualizarTotalesPagoConServer(0); // Ponemos los totales en $0
        const btn = document.querySelector('.btn-terminar-compra');
        if (btn) btn.disabled = true; // No se puede pagar si el carrito está vacío
        return;
    }

    contenedor.innerHTML = ''; // Limpiamos el contenedor antes de renderizar

    try {
        // Preparamos los items en el formato que espera el endpoint
        const itemsParaServer = carrito.map(i => ({ id: i.id, cantidad: i.qty }));
        
        // Pedimos al servidor el detalle completo del carrito (con precios reales)
        const res = await fetch('/carrito/detalle', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ items: itemsParaServer })
        });

        if (!res.ok) {
            contenedor.innerHTML = `<p style="color:#c00; padding:2rem;">Error al validar el carrito.</p>`;
            return;
        }

        const data = await res.json();

        // Mostramos advertencias de stock si hay productos con cantidad insuficiente
        if (data.advertencias && data.advertencias.length > 0) {
            contenedor.innerHTML += `
                <div style="background:#fff3cd; border-left:4px solid #f39c12; padding:12px 16px; margin-bottom:12px; border-radius:6px;">
                    <strong>Atención:</strong>
                    <ul style="margin:6px 0 0 20px;">
                        ${data.advertencias.map(a => `<li>${a}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        // Renderizamos cada producto del carrito
        for (const item of data.items) {
            const imgSrc = await cargarImagenURL(item.imagen); // URL firmada de S3
            contenedor.innerHTML += `
                <div class="cart-item">
                    <div class="col-article item-details">
                        <img src="${imgSrc}" alt="${item.titulo}" class="item-img"
                             onerror="this.src='https://via.placeholder.com/80x80/f8f8f8/333?text=Funko'">
                        <div class="item-info">
                            <h3>${item.titulo}</h3>
                            <p>$${item.precio_unitario.toFixed(2)} c/u</p>
                        </div>
                    </div>
                    <div class="col-qty" style="text-align: center;">
                        <span style="font-weight: 600; font-size: 1.1rem;">${item.cantidad}</span>
                    </div>
                    <div class="col-price item-total-price">
                        $${item.subtotal.toLocaleString('es-MX', {minimumFractionDigits: 2})}
                    </div>
                </div>
            `;
        }

        actualizarTotalesPagoConServer(data.total); // Actualizamos subtotal, envío y total

    } catch (error) {
        console.error("Error al cargar resumen del checkout:", error);
        contenedor.innerHTML = `<p style="color:#c00; padding:2rem;">No se pudo cargar el carrito.</p>`;
    }
}

// Costo de envío fijo definido como constante
// Se usa en actualizarTotalesPagoConServer y al llamar a Mercado Pago
const COSTO_ENVIO = 40;

/**
 * Calcula y muestra los totales en la sección de resumen del pago.
 * Si el subtotal es 0 (carrito vacío), el envío también es $0.
 * @param {number} subtotalOficial - Subtotal calculado por el servidor
 */
function actualizarTotalesPagoConServer(subtotalOficial) {
    const subtotal = parseFloat(subtotalOficial) || 0;
    const envio = subtotal > 0 ? COSTO_ENVIO : 0; // Sin productos, sin envío
    const totalFinal = subtotal + envio;

    // Guardamos en variable global para usarla al iniciar el pago con Mercado Pago
    TotalGLOB = parseFloat(totalFinal.toFixed(2));
    console.log("Subtotal:", subtotal, "Envío:", envio, "Total final:", TotalGLOB);

    // Actualizamos los elementos del DOM con los valores calculados
    const subtotalEl = document.getElementById('resumen-subtotal');
    const envioEl = document.getElementById('resumen-envio');
    const totalEl = document.getElementById('resumen-total');

    if (subtotalEl) subtotalEl.textContent = `$${subtotal.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;
    if (envioEl) envioEl.textContent = `$${envio.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;
    if (totalEl) totalEl.textContent = `$${totalFinal.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;
}


// ============================================================
// PAGO CON MERCADO PAGO
// ============================================================

/**
 * Inicia el proceso de pago con Mercado Pago.
 * Flujo:
 *   1. Valida que el carrito no esté vacío
 *   2. Llama al servidor (/pago/iniciar) que:
 *      a. Valida stock y precios en la BD
 *      b. Crea una compra "Pendiente" en MongoDB
 *      c. Crea una preferencia de pago en MP
 *      d. Devuelve la URL de pago de MP
 *   3. Guarda el ID de la compra en localStorage (para referencia)
 *   4. Redirige al usuario a la URL de pago de Mercado Pago
 */
async function procesarPago() {
    if (!carrito || carrito.length === 0) {
        alert('Tu carrito está vacío');
        return;
    }

    // Deshabilitamos el botón para evitar clicks múltiples
    const btn = document.querySelector('.btn-terminar-compra');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Procesando...';
    }

    try {
        // Llamamos al endpoint que crea la preferencia de pago en Mercado Pago
        const response = await fetch('/pago/iniciar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: carrito,      // Array del carrito {id, titulo, qty}
                envio: COSTO_ENVIO   // Costo de envío fijo
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Error al crear el pago');
        }

        const { url, idCompra } = await response.json();
        console.log(`Compra Pendiente creada (${idCompra}). Redirigiendo a MP...`);

        // Guardamos el ID de la compra por si queremos verificarla después del pago
        localStorage.setItem('ultimaCompraPendiente', idCompra);

        // Redirigimos al usuario al sitio de pago de Mercado Pago
        window.location.href = url;

    } catch (error) {
        console.error('Error al procesar el pago:', error);
        alert('Hubo un error al iniciar el pago: ' + error.message);

        // Rehabilitamos el botón si hubo error para que el usuario pueda intentar de nuevo
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'TERMINAR COMPRA';
        }
    }
}


/**
 * Redirige al catálogo con un término de búsqueda en la URL.
 * Client.html detecta el parámetro ?q= al cargar y ejecuta la búsqueda automáticamente.
 * @param {Event} event - Evento del formulario de búsqueda (para prevenir reload)
 */
function irABuscar(event) {
    if (event) event.preventDefault();
    const input = document.getElementById('search-input');
    const q = input ? input.value.trim() : '';
    window.location.href = q ? `Client.html?q=${encodeURIComponent(q)}` : 'Client.html';
    return false;
}


/**
 * Obtiene la URL firmada de S3 para una imagen de producto.
 * @param {string} keyimagen - Nombre/key del archivo en S3
 * @returns {string} URL temporal con acceso a la imagen (expira en 1 hora)
 */
async function cargarImagenURL(keyimagen){
    const res = await fetch(`/files/${keyimagen}`);
    const data = await res.json();
    return data.url;
}
