// ============================================================
// public/ComprasSC.js — Lógica del historial de compras (MisCompras.html)
// Maneja: autenticación, carga del historial de compras del usuario,
//         renderizado de tarjetas expandibles y el carrito lateral.
// ============================================================

// --- VARIABLES GLOBALES ---
let carrito = [];  // Array local con los items del carrito
let idUser;        // ID de MongoDB del usuario logueado

// ============================================================
// INICIALIZACIÓN
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Referencias a elementos de la UI del carrito lateral (sidebar)
    const homeIcon = document.getElementById('home-icon');
    const cartIcon = document.getElementById('cart-icon');
    const btnCloseCart = document.getElementById('btn-close-cart');
    const sidebar = document.getElementById('sidebar');

    // Eventos de navegación
    if (homeIcon) homeIcon.onclick = volverAlHome;
    if (cartIcon) cartIcon.onclick = () => sidebar.classList.add('open');
    if (btnCloseCart) btnCloseCart.onclick = () => sidebar.classList.remove('open');

    checkAuth();              // Verifica sesión y carga el carrito del usuario si está logueado
    CargarComprasU();         // Carga el historial de compras del usuario
    actualizarInterfazCarrito(); // Inicializa el badge y totales en $0
});

// ============================================================
// AUTENTICACIÓN
// ============================================================

/**
 * Verifica si hay sesión activa y actualiza la interfaz.
 * Si el usuario está logueado, carga su carrito desde MongoDB.
 */
async function checkAuth() {
    try {
        const response = await fetch('/auth/whoami');
        const loginBtn = document.getElementById('login-btn');
        const userInfo = document.getElementById('user-info');
        const userPhoto = document.getElementById('user-photo');
        const userName = document.getElementById('user-name');

        if (response.ok) {
            const user = await response.json();
            idUser = user._id;

            // Actualizamos la UI con datos del usuario
            loginBtn.classList.add('hidden');
            userInfo.classList.remove('hidden');
            userPhoto.src = user.foto;
            userName.textContent = user.nombre.split(' ')[0]; // Solo el primer nombre

            // Mostramos el botón de Admin si tiene ese rol
            const adminLink = document.getElementById('admin-link');
            if (adminLink && user.rol === 'admin') {
                adminLink.classList.remove('hidden');
            }
            
            // Cargamos el carrito guardado en MongoDB
            if (user.carrito && user.carrito.length > 0) {
                carrito = user.carrito.map(item => ({
                    id: item.producto_id,
                    titulo: item.titulo,
                    qty: item.cantidad
                }));
                await actualizarInterfazCarrito();
            }
        }
    } catch (error) {
        console.log("Sesión no iniciada");
    }
}

// Redirige al catálogo principal
function volverAlHome() {
    window.location.href = 'Client.html';
}

// ============================================================
// NAVEGACIÓN
// ============================================================

// Navega a la página de detalle de un producto
async function verDetalle(id) {
    window.location.href = `Detalle.html?id=${id}`;
}

// Navega a la página de pago
async function VerPago() {
    window.location.href = "Pagos.html";
}

// ============================================================
// LÓGICA DEL CARRITO LATERAL (sidebar)
// ============================================================

/**
 * Agrega un producto al carrito o incrementa su cantidad.
 * Valida stock en la BD antes de agregar.
 */
async function agregarAlCarrito(id, titulo) {
    try {
        const res = await fetch(`/productos/${id}`);
        const productoDB = await res.json();
        const itemExistente = carrito.find(item => item.id === id);

        if (itemExistente) {
            if (itemExistente.qty + 1 > productoDB.cantidad) {
                alert(`¡No! Solo hay ${productoDB.cantidad} disponibles de "${titulo}".`);
                return; 
            }
            itemExistente.qty += 1;
        } else {
            if (productoDB.cantidad < 1) {
                alert("Lo sentimos, este Funko está agotado.");
                return;
            }
            carrito.push({ id, titulo, qty: 1 });
        }

        guardarYActualizar();
        document.getElementById('sidebar').classList.add('open');
    } catch (error) {
        console.error("Error al verificar cantidades:", error);
    }
}

/**
 * Cambia la cantidad de un item en el carrito (+1 o -1).
 */
async function cambiarCantidad(index, delta) {
    const item = carrito[index];
    const nuevaCantidad = item.qty + delta;

    if (nuevaCantidad < 1) return;

    try {
        const res = await fetch(`/productos/${item.id}`);
        const productoDB = await res.json();

        if (nuevaCantidad > productoDB.cantidad) {
            alert(`Lo sentimos, solo quedan ${productoDB.cantidad} piezas.`);
            return;
        }

        item.qty = nuevaCantidad;
        guardarYActualizar();
    } catch (e) { console.error("Error al validar", e); }
}

// Elimina un item del carrito por su índice
function eliminarDelCarrito(index) {
    carrito.splice(index, 1);
    guardarYActualizar();
}

// Guarda el carrito en MongoDB y localStorage, luego actualiza la UI
function guardarYActualizar() {
    GuardarCarritoConcurrentDB();
    localStorage.setItem(`cart_user_${idUser}`, JSON.stringify(carrito));
    actualizarInterfazCarrito();
}

/**
 * Sincroniza el carrito con MongoDB en segundo plano.
 * Envía el array completo del carrito para reemplazar el guardado en la BD.
 */
async function GuardarCarritoConcurrentDB() {
    if (!idUser) return;
    try {
        const payload = {
            items: carrito.map(i => ({
                id: i.id,
                titulo: i.titulo,
                qty: Number(i.qty)
            })),
            idUsuario: idUser
        };

        const response = await fetch('/ActualizarCarritoDB', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Error al actualizar carrito en BD");
        const data = await response.json();
        console.log("Carrito sincronizado:", data);
    } catch (error) {
        console.error("Error al sincronizar carrito con BD:", error);
    }
}

/**
 * Actualiza el sidebar del carrito con los datos actuales.
 * Consulta al servidor los precios y stock reales de cada producto.
 */
async function actualizarInterfazCarrito() {
    const list = document.getElementById('cart-list');
    const totalDisplay = document.getElementById('cart-total');
    const subtotalDisplay = document.getElementById('cart-subtotal');
    const badge = document.getElementById('cart-badge');

    // Actualizamos el badge con el total de piezas
    if (badge) {
        const totalPiezas = (carrito || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
        badge.innerText = totalPiezas;
    }

    // Carrito vacío
    if (!carrito || carrito.length === 0) {
        console.log("Carrito vacío", carrito);
        if (list) list.innerHTML = `<p style="text-align:center; padding:20px;">Carrito vacío</p>`;
        if (totalDisplay) totalDisplay.innerText = '$0.00';
        if (subtotalDisplay) subtotalDisplay.innerText = '$0.00';
        console.log("Carrito vacío, interfaz actualizada.");
        return;
    }
    const itemsParaServer = carrito.map(i => ({ id: i.id, cantidad: i.qty }));
    console.log("Actualizando interfaz del carrito con items:", carrito);
try {
    console.log("try");
    console.log("items:", itemsParaServer);
    const res = await fetch('/carrito/detalle', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ items: itemsParaServer })
    });
    const data = await res.json();

    if (!list) return;

    // Generamos el HTML de cada item con imagen de S3 (asíncrono)
    const promesasHtml = data.items.map(async (item, i) => {
        const imgSrc = await cargarImagenURL(item.imagen);
        
        const advertenciaStock = !item.stock_ok
            ? `<small style="color:#c00; display:block;">Solo hay ${item.stock_disponible} disponibles</small>`
            : '';

        return `
        <div class="cart-item-modern">
            <img src="${imgSrc}" alt="${escapeAttr(item.titulo)}" class="cart-item-img-modern"
                 onerror="this.src='img/placeholder.png'">
            <div class="cart-item-details-modern">
                <div class="cart-item-header-modern">
                    <span class="cart-item-title-modern">${escapeHtml(item.titulo)}</span>
                    <i class="bi bi-trash3 cart-item-delete-modern" onclick="eliminarDelCarrito(${i})"></i>
                </div>
                <span class="cart-item-subtitle-modern">
                    $${item.precio_unitario.toFixed(2)} c/u · Subtotal: $${item.subtotal.toFixed(2)}
                </span>
                ${advertenciaStock}
                <div class="cart-item-controls-modern">
                    <div class="cart-qty-pill-modern">
                        <button class="qty-btn-modern" onclick="cambiarCantidad(${i}, -1)"><i class="bi bi-dash"></i></button>
                        <span class="qty-val-modern">${item.cantidad}</span>
                        <button class="qty-btn-modern" onclick="cambiarCantidad(${i}, 1)"><i class="bi bi-plus"></i></button>
                    </div>
                </div>
            </div>
        </div>
        `;
    });

    const itemsHtml = await Promise.all(promesasHtml);
    list.innerHTML = itemsHtml.join('');

        const totalFormateado = `$${Number(data.total).toFixed(2)}`;
        if (totalDisplay) totalDisplay.innerText = totalFormateado;
        if (subtotalDisplay) subtotalDisplay.innerText = totalFormateado;

        // Sincronizamos títulos locales con los de la BD
        carrito.forEach((it, idx) => {
            if (data.items[idx]) {
                it.titulo = data.items[idx].titulo;
            }
        });

    } catch (e) {
        console.error("Error total:", e);
    }
}

// Helpers de seguridad para evitar XSS en el DOM
function escapeHtml(t) {
    const div = document.createElement('div');
    div.textContent = t == null ? '' : String(t);
    return div.innerHTML;
}

function escapeAttr(t) {
    return escapeHtml(t).replace(/"/g, '&quot;');
}

/**
 * Cierra la sesión: primero sincroniza el carrito y luego llama al endpoint de logout.
 */
async function CerrarCarrito() {
    try {
        await GuardarCarritoConcurrentDB(); // Guardamos el carrito antes de cerrar sesión
    } catch (e) {
        console.warn("No se pudo sincronizar el carrito antes de cerrar sesión:", e);
    }

    window.location.href = '/auth/logout'; // El servidor limpia la sesión y redirige al inicio
}


// ============================================================
// HISTORIAL DE COMPRAS
// ============================================================

/**
 * Carga el historial de compras del usuario desde el servidor.
 * Si no está logueado (401), muestra la pantalla de "sin compras".
 */
async function CargarComprasU() {
    try {
        const res = await fetch('/MisCompras'); // Endpoint protegido — requiere sesión

        if (res.status === 401) {
            renderizarCompras([]); // Sin sesión, mostramos estado vacío
            console.log("Usuario no logueado");
            return;
        }

        if (!res.ok) {
            console.log("Error al cargar compras");
            renderizarCompras([]);
            return;
        }

        const compras = await res.json();
        console.log("Compras recibidas:", compras);

        await renderizarCompras(compras); // Renderizamos las tarjetas de compras

    } catch (error) {
        console.error("Error al cargar datos de las compras:", error);
        renderizarCompras([]);
    }
}


/**
 * Renderiza las tarjetas de compras en el DOM.
 * Cada tarjeta muestra: número de pedido, fecha, status, total, y productos (expandible).
 * Si no hay compras, muestra un mensaje de estado vacío.
 * @param {Array} compras - Array de compras con productos ya enriquecidos del servidor
 */
async function renderizarCompras(compras) {
    const contenedor = document.querySelector('.orders-list');
    if (!contenedor) return;

    // Estado vacío: el usuario no tiene compras
    if (!compras || compras.length === 0) {
        contenedor.innerHTML = `
            <div class="order-card" style="padding: 3rem; text-align: center;">
                <h2>Aún no tienes compras registradas</h2>
                <p style="color: #666; margin-top: 10px;">Cuando realices una compra, aparecerá aquí.</p>
            </div>
        `;
        return;
    }

    contenedor.innerHTML = ''; // Limpiamos antes de insertar

    for (const compra of compras) {
        const productos = compra.productos || [];

        // Calculamos el total de piezas sumando las cantidades de todos los productos
        const totalPiezas = productos.reduce(
            (acc, p) => acc + Number(p.cantidad || 0), 0
        );

        // Formateamos la fecha en español
        let fechaFormateada = '';
        if (compra.fecha) {
            const f = new Date(compra.fecha);
            if (!isNaN(f)) {
                fechaFormateada = f.toLocaleDateString('es-MX', {
                    day: 'numeric', month: 'long', year: 'numeric'
                });
            }
        }

        // Clase CSS y ícono para el pill de status (Completado/Pendiente/Fallido)
        const statusClass =
            compra.status === 'Completado' ? 'delivered' :
            compra.status === 'Pendiente'  ? 'pending' :
            compra.status === 'Fallido'    ? 'failed' : '';
        const statusIcon =
            compra.status === 'Completado' ? 'bi-check-circle' :
            compra.status === 'Pendiente'  ? 'bi-hourglass-split' :
            compra.status === 'Fallido'    ? 'bi-x-circle' : 'bi-circle';
        
        // Generamos el HTML de los thumbnails de productos (con imágenes de S3)
        const thumbnailsHTML = await Promise.all(productos.map(async (f) => {
        const imgSrc = await cargarImagenURL(f.imagen); // URL firmada de S3
        
        return `
                <div class="order-item-row">
                <div class="item-product-info">
                    <img src="${imgSrc}" alt="${f.titulo}"
                         onerror="this.src='https://placehold.co/600x400/EEE/31343C?text=Funko'">
                    <div>
                        <h4>${f.titulo}</h4>
                        <p>Funko Pop · Cant. ${f.cantidad} · $${Number(f.precio || 0).toFixed(2)} c/u</p>
                    </div>
                </div>
            </div>
            `;
    }));

        // Últimos 6 caracteres del ID de MongoDB (para mostrar #ABC123 en lugar del ObjectId completo)
        const shortId = String(compra._id).slice(-6).toUpperCase();
        
        // Armamos la tarjeta completa de la compra
        const tarjeta = `
            <div class="order-card">
                <!-- Header clickeable para expandir/contraer el detalle -->
                <div class="order-header" onclick="toggleOrderDetails(this)">
                    <div class="order-header-left">
                        <div class="order-basic-info">
                            <div class="order-id-group">
                                <h3>Pedido #${shortId}</h3>
                                <span class="status-pill ${statusClass}">
                                    <i class="bi ${statusIcon}"></i> ${compra.status || '—'}
                                </span>
                            </div>
                            <p class="order-date-items">
                                ${fechaFormateada || 'Reciente'}
                                <span class="dot-separator">·</span> ${totalPiezas} artículos
                            </p>
                        </div>
                    </div>
                    <div class="order-header-right">
                        <span class="order-total-price">$${Number(compra.total).toFixed(2)}</span>
                        <i class="bi bi-chevron-down expand-icon"></i>
                    </div>
                </div>

                <!-- Cuerpo del detalle (oculto por defecto) -->
                <div class="order-body">
                    <!-- Tracker visual de progreso del pedido -->
                    <div class="progress-tracker">
                        <div class="progress-step completed"><div class="step-icon"><i class="bi bi-check"></i></div><span class="step-label">Confirmado</span></div>
                        <div class="progress-line ${compra.status === 'Completado' ? 'completed' : ''}"></div>
                        <div class="progress-step ${compra.status === 'Completado' ? 'completed' : ''}"><div class="step-dot"></div></div>
                        <div class="progress-line ${compra.status === 'Completado' ? 'completed' : ''}"></div>
                        <div class="progress-step ${compra.status === 'Completado' ? 'completed' : ''}"><div class="step-icon"><i class="bi bi-check"></i></div><span class="step-label">${compra.status === 'Completado' ? 'Entregado' : compra.status}</span></div>
                    </div>

                    <!-- Lista de productos de la compra -->
                    <div class="order-items-list">
                        ${thumbnailsHTML}
                    </div>
                </div>
            </div>
        `;

        // Insertamos la tarjeta al final del contenedor
        contenedor.insertAdjacentHTML('beforeend', tarjeta);
    }
}


/**
 * Redirige al catálogo principal para hacer una nueva compra.
 * @param {string} idcompra - ID de la compra anterior (no se usa actualmente)
 */
function volverAComprar(idcompra) {
    console.log("Volver a comprar pedido:", idcompra);
    window.location.href = 'Client.html';
}


/**
 * Redirige al catálogo con un término de búsqueda en la URL.
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
