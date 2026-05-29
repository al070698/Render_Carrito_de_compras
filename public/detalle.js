// ============================================================
// public/detalle.js — Lógica de la página de detalle de producto (Detalle.html)
// Maneja: carga del producto, galería de imagen, carrito y autenticación.
// El ID del producto se pasa por la URL: /Detalle.html?id=<mongoId>
// ============================================================

// --- VARIABLES GLOBALES ---
let idUser;     // ID de MongoDB del usuario logueado
let carrito = []; // Array local con los items del carrito

// ============================================================
// INICIALIZACIÓN
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Referencias a elementos de la interfaz
    const cartIcon = document.getElementById('cart-icon');
    const btnCloseCart = document.getElementById('btn-close-cart');
    const sidebar = document.getElementById('sidebar');
    const homeIcon = document.getElementById('home-icon');

    // Eventos de navegación del carrito y el home
    if (cartIcon) cartIcon.onclick = () => sidebar.classList.add('open');
    if (btnCloseCart) btnCloseCart.onclick = () => sidebar.classList.remove('open');
    if (homeIcon) homeIcon.onclick = () => window.location.href = 'Client.html';

    checkAuth();                // Verifica sesión y carga el carrito del usuario
    cargarDetalle();            // Carga y muestra los datos del producto
    actualizarInterfazCarrito(); // Inicializa el badge y totales en $0
});

/**
 * Lee el ID del producto desde los parámetros de la URL.
 * Ej: /Detalle.html?id=64abc123 → retorna "64abc123"
 * @returns {string|null} ID del producto o null si no está en la URL
 */
function getProductoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

// ============================================================
// CARGA DEL DETALLE DEL PRODUCTO
// ============================================================

/**
 * Carga los datos del producto desde el servidor usando el ID de la URL.
 * Actualiza todos los elementos de la página: imagen, título, precio,
 * descripción, badge de stock y el botón "Añadir al carrito".
 */
async function cargarDetalle() {
    const id = getProductoId();

    if (!id) {
        // Si no hay ID en la URL, mostramos error
        document.getElementById('det-titulo').innerText = 'Producto no encontrado';
        return;
    }

    try {
        const res = await fetch(`/productos/${id}`); // GET al endpoint de un producto por ID
        if (!res.ok) throw new Error('No encontrado');
        const f = await res.json(); // f = datos del Funko Pop

        const agotado = Number(f.cantidad) === 0; // Verificamos si hay stock

        // Actualizamos el título de la pestaña del navegador
        document.title = `${f.titulo} - Funko Hunter`;
        
        // Rellenamos los elementos del DOM con los datos del producto
        document.getElementById('det-titulo').innerText = f.titulo;
        document.getElementById('det-precio').innerText = `$${Number(f.precio).toFixed(2)}`;
        document.getElementById('det-desc').innerHTML = `
            <p>${escapeHtml(f.descripcion || 'Sin descripción disponible.')}</p>
            <p><strong>${agotado ? '⚠ Sin existencias' : `Disponibles: ${f.cantidad}`}</strong></p>
        `;

        // Cargamos la imagen desde S3 usando la URL firmada
        const imgEl = document.getElementById('mainProductImage');
        if (imgEl) {
            imgEl.src = await cargarImagenURL(f.imagen);
            imgEl.alt = f.titulo;
            // Si la imagen falla (S3 no disponible), mostramos un placeholder
            imgEl.onerror = () => {
                imgEl.src = `https://via.placeholder.com/500x500/f8f8f8/333?text=${encodeURIComponent(f.titulo)}`;
            };
        }

        // Actualizamos el badge de "EN STOCK" / "AGOTADO"
        const statusBadge = document.querySelector('.status-badge');
        if (statusBadge) {
            if (agotado) {
                // Cambiamos el estilo del badge a rojo para indicar que está agotado
                statusBadge.classList.remove('new');
                statusBadge.classList.add('agotado');
                statusBadge.textContent = 'AGOTADO';
                statusBadge.style.background = '#c0392b';
                statusBadge.style.color = '#fff';
            } else {
                statusBadge.textContent = 'EN STOCK';
            }
        }

        // Configuramos el botón "Añadir al carrito"
        const btn = document.getElementById('btn-add-det');
        if (btn) {
            if (agotado) {
                // Si está agotado, deshabilitamos el botón y cambiamos su texto
                btn.disabled = true;
                btn.innerHTML = '<i class="bi bi-x-circle" style="margin-right: 8px;"></i> Agotado';
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            } else {
                // Si hay stock, asignamos la función para agregar al carrito
                btn.onclick = () => agregarAlCarrito(f._id, f.titulo);
            }
        }

    } catch (e) {
        document.getElementById('det-titulo').innerText = 'Funko no encontrado';
        console.error(e);
    }
}

// ============================================================
// HELPERS DE SEGURIDAD
// ============================================================

/**
 * Escapa caracteres especiales de HTML para evitar inyección de HTML malicioso.
 */
function escapeHtml(t) {
    const div = document.createElement('div');
    div.textContent = t == null ? '' : String(t);
    return div.innerHTML;
}

/**
 * Escapa para atributos HTML (incluye comillas dobles).
 */
function escapeAttr(t) {
    return escapeHtml(t).replace(/"/g, '&quot;');
}

// ============================================================
// AUTENTICACIÓN
// ============================================================

/**
 * Verifica si hay sesión activa y actualiza la interfaz.
 * Si el usuario está logueado, carga su carrito de MongoDB.
 */
async function checkAuth() {
    try {
        const loginBtn = document.getElementById('login-btn');
        const userInfo = document.getElementById('user-info');
        const userPhoto = document.getElementById('user-photo');
        const userName = document.getElementById('user-name');
        const response = await fetch('/auth/whoami');

        if (response.ok) {
            const user = await response.json();
            idUser = user._id;

            // Actualizamos la UI con los datos del usuario
            loginBtn.classList.add('hidden');
            userInfo.classList.remove('hidden');
            userPhoto.src = user.foto;
            userName.textContent = user.nombre.split(' ')[0]; // Solo el primer nombre

            // Mostramos el enlace al panel admin si el usuario tiene ese rol
            const adminLink = document.getElementById('admin-link');
            if (adminLink && user.rol === 'admin') {
                adminLink.classList.remove('hidden');
            }
            
            // Si tiene carrito en MongoDB, lo cargamos al estado local
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

// ============================================================
// LÓGICA DEL CARRITO
// ============================================================

/**
 * Agrega el producto actual al carrito o incrementa su cantidad.
 * Valida el stock disponible consultando la BD antes de agregar.
 * @param {string} id - ID de MongoDB del producto
 * @param {string} titulo - Nombre del producto
 */
async function agregarAlCarrito(id, titulo) {
    console.log(id);
    try {
        // Verificamos el stock real en la BD (no nos fiamos de lo mostrado en pantalla)
        const res = await fetch(`/productos/${id}`);
        if (!res.ok) throw new Error("Producto no encontrado");
        
        const productoDB = await res.json();
        
        const itemExistente = carrito.find(item => item.id === id);

        if (itemExistente) {
            // El producto ya está en el carrito — validamos que no exceda el stock
            if (itemExistente.qty + 1 > productoDB.cantidad) {
                alert(`¡No! Solo hay ${productoDB.cantidad} disponibles.`);
                return; 
            }
            itemExistente.qty += 1;
        } else {
            carrito.push({ id: id, titulo: titulo, qty: 1 }); // Nuevo item con cantidad 1
        }

        guardarYActualizar(); // Sincroniza con BD y actualiza la interfaz
        document.getElementById('sidebar').classList.add('open'); // Abre el sidebar del carrito
    } catch (error) {
        console.error("Error al verificar cantidades:", error);
        alert("Error al conectar con la base de datos de productos.");
    }
}

/**
 * Incrementa o decrementa la cantidad de un item del carrito.
 * Valida el stock si se está incrementando.
 * @param {number} index - Posición en el array carrito
 * @param {number} delta - +1 para aumentar, -1 para disminuir
 */
async function cambiarCantidad(index, delta) {
    const item = carrito[index];
    const nuevaCantidad = item.qty + delta;

    if (nuevaCantidad < 1) return; // Mínimo 1 unidad

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

// Elimina un item del carrito por su posición en el array
function eliminarDelCarrito(index) {
    carrito.splice(index, 1); // Elimina 1 elemento en la posición index
    guardarYActualizar();
}

/**
 * Guarda el carrito en MongoDB y en localStorage, luego actualiza la interfaz.
 */
function guardarYActualizar() {
    GuardarCarritoConcurrentDB(); // Sincroniza con MongoDB en segundo plano
    console.log("usuario a guardar cambio", idUser);
    console.log("carrito de usuario cargado asi:", carrito);
    localStorage.setItem(`cart_user_${idUser}`, JSON.stringify(carrito)); // Respaldo local
    actualizarInterfazCarrito(); // Actualiza el sidebar
}

/**
 * Sincroniza el estado actual del carrito con MongoDB.
 * Operación asíncrona que no bloquea la UI.
 */
async function GuardarCarritoConcurrentDB() {
    if (!idUser) return; // Sin usuario logueado, no guardamos

    try {
        const payload = {
            idUsuario: idUser,
            items: carrito
        };

        const response = await fetch('/ActualizarCarritoDB', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log("Carrito sincronizado en la nube");
        }
    } catch (error) {
        console.error("Error al sincronizar con MongoDB:", error);
    }
}

/**
 * Actualiza completamente el sidebar del carrito.
 * Consulta los precios actuales al servidor y renderiza los items.
 */
async function actualizarInterfazCarrito() {
    console.log("tamaño del carrito", carrito.length, JSON.stringify(carrito));
    const list = document.getElementById('cart-list');
    const totalDisplay = document.getElementById('cart-total');
    const subtotalDisplay = document.getElementById('cart-subtotal');
    const badge = document.getElementById('cart-badge');

    // Actualizamos el badge con el número total de piezas en el carrito
    if (badge) {
        const totalPiezas = carrito.reduce((sum, item) => sum + Number(item.qty || 0), 0);
        badge.innerText = totalPiezas;
    }

    // Carrito vacío — mostramos mensaje y ponemos totales en $0
    if (carrito.length === 0) {
        if (list) list.innerHTML = `<p style="text-align:center; padding:20px;">Carrito vacío</p>`;
        if (totalDisplay) totalDisplay.innerText = "$0.00";
        if (subtotalDisplay) subtotalDisplay.innerText = "$0.00";
        return;
    }

    const itemsParaServer = carrito.map(i => ({ id: i.id, cantidad: i.qty }));

try {
    // Pedimos los detalles actualizados al servidor
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
        
        // Advertencia si el stock no alcanza para la cantidad solicitada
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

    // Esperamos a todas las promesas e insertamos el resultado
    const itemsHtml = await Promise.all(promesasHtml);
    list.innerHTML = itemsHtml.join('');

        // Actualizamos el total con el valor calculado por el servidor
        const totalFormateado = `$${Number(data.total).toFixed(2)}`;
        if (totalDisplay) totalDisplay.innerText = totalFormateado;
        if (subtotalDisplay) subtotalDisplay.innerText = totalFormateado;

        // Sincronizamos los títulos locales por si fueron modificados en la BD
        carrito.forEach((it, idx) => {
            if (data.items[idx]) {
                it.titulo = data.items[idx].titulo;
            }
        });

    } catch (e) {
        console.error("Error total al actualizar interfaz:", e);
    }
}

/**
 * Cierra la sesión del usuario.
 */
async function CerrarCarrito(){
    try{
        fetch('/auth/logout', {
        method: 'GET',
        credentials: 'include'
        })
        .then(response => {
            if (response.redirected) {
            window.location.href = response.url;
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

// Navega a la página de pago
async function VerPago() {
    window.location.href = "Pagos.html";
}

/**
 * Redirige al catálogo con el término de búsqueda en la URL.
 * Client.html lo detecta al cargar y ejecuta la búsqueda automáticamente.
 * @param {Event} event - Evento del formulario
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
 * @returns {string} URL temporal con acceso a la imagen
 */
async function cargarImagenURL(keyimagen){
    const res = await fetch(`/files/${keyimagen}`);
    const data = await res.json();
    return data.url;
}
