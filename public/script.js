// ============================================================
// public/script.js — Lógica del catálogo de productos (Client.html)
// Maneja: autenticación, catálogo con paginación, búsqueda,
//         carrito de compras y sincronización con MongoDB.
// ============================================================

// --- VARIABLES GLOBALES ---
let carrito = [];           // Array local con los items del carrito {id, titulo, qty}
let idUser;                 // ID de MongoDB del usuario logueado (undefined si no hay sesión)
let cargadosiono = false;   // Flag para saber si los productos ya fueron cargados
let paginaActual = 1;       // Página activa en el catálogo paginado
const itemsPorPagina = 5;   // Cuántos productos se muestran por página
let todosLosProductos = []; // Cache de todos los productos cargados desde el servidor

document.cookie; // Acceso inicial a las cookies (no se usa activamente aquí)

// ============================================================
// INICIALIZACIÓN: Se ejecuta cuando el DOM está completamente cargado
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Referencias a elementos de la interfaz
    const homeIcon = document.getElementById('home-icon');
    const cartIcon = document.getElementById('cart-icon');
    const ComprasIcon = document.getElementById('compras-icon');
    const btnCloseCart = document.getElementById('btn-close-cart');
    const sidebar = document.getElementById('sidebar');

    // Asignamos los eventos de navegación si los elementos existen en el HTML
    if (homeIcon) homeIcon.onclick = volverAlHome;
    if (ComprasIcon) ComprasIcon.onclick = () => CargarComprasU();
    if (cartIcon) cartIcon.onclick = () => sidebar.classList.add('open');       // Abre el carrito
    if (btnCloseCart) btnCloseCart.onclick = () => sidebar.classList.remove('open'); // Cierra el carrito

    // Verificamos si hay sesión activa y cargamos el carrito del usuario si la hay
    checkAuth();
    actualizarInterfazCarrito(); // Inicializa el badge y el total en $0.00

    // Si la URL tiene ?q=... (búsqueda desde otra página), ejecutamos esa búsqueda automáticamente
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) {
        const input = document.getElementById('search-input');
        if (input) input.value = q; // Rellenamos el campo de búsqueda con el término
        BuscarFunco(); // Ejecutamos la búsqueda
    } else {
        cargarCatalogo(); // Si no hay búsqueda, cargamos el catálogo completo
    }
});

// ============================================================
// AUTENTICACIÓN
// ============================================================

/**
 * Verifica si hay una sesión activa consultando al servidor.
 * Si el usuario está logueado:
 *   - Muestra su nombre y foto
 *   - Muestra el botón de admin si corresponde
 *   - Carga su carrito desde MongoDB
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
            idUser = user._id; // Guardamos el ID de MongoDB para operaciones del carrito

            // Mostramos la info del usuario y ocultamos el botón de login
            loginBtn.classList.add('hidden');
            userInfo.classList.remove('hidden');
            
            // Mostramos nombre (solo primer nombre) y foto de Google
            userPhoto.src = user.foto;
            userName.textContent = user.nombre.split(' ')[0];

            // Si el usuario es admin, mostramos el enlace al panel de administración
            const adminLink = document.getElementById('admin-link');
            if (adminLink && user.rol === 'admin') {
                adminLink.classList.remove('hidden');
            }
            
            // Si el usuario tiene carrito guardado en MongoDB, lo cargamos al estado local
            if (user.carrito && user.carrito.length > 0) {
                // Convertimos del formato de MongoDB al formato local del script
                // MongoDB: { producto_id, titulo, cantidad }
                // Local:   { id, titulo, qty }
                carrito = user.carrito.map(item => ({
                    id: item.producto_id,
                    titulo: item.titulo,
                    qty: item.cantidad
                }));
                await actualizarInterfazCarrito(); // Actualizamos la UI con el carrito cargado
            }
        }
    } catch (error) {
        console.log("Sesión no iniciada"); // Error silencioso — el usuario simplemente no está logueado
    }
}

// Redirige al catálogo principal
function volverAlHome() {
    window.location.href = 'Client.html';
}

// Redirige a la página de historial de compras del usuario
function CargarComprasU(){
    window.location.href = 'MisCompras.html';
}

// ============================================================
// CATÁLOGO DE PRODUCTOS
// ============================================================

/**
 * Carga todos los productos desde el servidor y los guarda en el cache local.
 * Luego renderiza la primera página del catálogo.
 */
async function cargarCatalogo() {
    try {
        const res = await fetch('/productos'); // GET al endpoint que devuelve todos los productos
        todosLosProductos = await res.json(); // Guardamos todos en memoria para la paginación
        
        await renderizarPagina(1); // Mostramos la primera página
    } catch (e) { 
        console.error("Error catálogo:", e); 
    }
}

/**
 * Renderiza una página específica del catálogo.
 * Calcula los productos correspondientes a esa página usando el cache local.
 * @param {number} pagina - Número de página a mostrar (empieza en 1)
 */
async function renderizarPagina(pagina) {
    paginaActual = pagina;
    const catalog = document.getElementById('catalog');
    
    // Calculamos el rango de índices para la página actual
    const inicio = (pagina - 1) * itemsPorPagina;
    const fin = inicio + itemsPorPagina;
    const productosVisibles = todosLosProductos.slice(inicio, fin); // Cortamos el array

    // Generamos el HTML de cada tarjeta de forma asíncrona (necesitamos await para las imágenes de S3)
    const tarjetasHtml = await Promise.all(productosVisibles.map(async (f) => {
        const agotado = Number(f.cantidad) === 0; // True si no hay stock
        const imgSrc = await cargarImagenURL(f.imagen); // Obtenemos la URL firmada de S3
        
        return `
            <div class="product-card ${agotado ? 'product-card-agotado' : ''}">
                <img src="${imgSrc}" alt="${escapeAttr(f.titulo)}" onclick="verDetalle('${f._id}')">
                ${agotado ? '<span class="badge-agotado">AGOTADO</span>' : ''}
                <div class="card-info">
                    <h4>${escapeHtml(f.titulo)}</h4>
                    <span class="stock-info">${agotado ? 'Sin existencias' : `Stock: ${f.cantidad}`}</span>
                    <div class="price-row">
                        <span class="price">$${Number(f.precio).toFixed(2)}</span>
                        <button class="btn-add-modern" ${agotado ? 'disabled' : ''} onclick="agregarAlCarrito('${f._id}', '${escapeAttr(f.titulo)}')">
                            <i class="bi bi-cart-plus"></i>
                        </button>
                    </div>
                </div>
            </div>`;
    }));

    catalog.innerHTML = tarjetasHtml.join(''); // Insertamos todas las tarjetas en el DOM

    crearControlesPaginacion(); // Renderizamos los botones de paginación
}

/**
 * Crea los botones de paginación dinámicamente.
 * Muestra siempre la primera y última página, más las páginas cercanas a la actual.
 * Usa "..." para indicar saltos entre páginas no mostradas.
 */
function crearControlesPaginacion() {
    const totalPaginas = Math.ceil(todosLosProductos.length / itemsPorPagina);
    const container = document.getElementById('pagination-container');
    if (!container) return;

    let html = '';

    // Botón "Anterior" — deshabilitado en la primera página
    html += `<button ${paginaActual === 1 ? 'disabled' : ''} onclick="renderizarPagina(${paginaActual - 1})">
                <i class="bi bi-chevron-left"></i>
             </button>`;

    // Generamos los números de página con lógica de puntos suspensivos
    const rango = 2; // Cuántas páginas se muestran a cada lado de la página actual
    
    for (let i = 1; i <= totalPaginas; i++) {
        // Mostramos la primera, la última, y las dentro del rango de la página actual
        if (i === 1 || i === totalPaginas || (i >= paginaActual - rango && i <= paginaActual + rango)) {
            html += `<button class="${i === paginaActual ? 'active' : ''}" onclick="renderizarPagina(${i})">${i}</button>`;
        } 
        // Mostramos "..." antes y después del rango visible (solo una vez por salto)
        else if (i === paginaActual - rango - 1 || i === paginaActual + rango + 1) {
            html += `<span class="dots">...</span>`;
        }
    }

    // Botón "Siguiente" — deshabilitado en la última página
    html += `<button ${paginaActual === totalPaginas ? 'disabled' : ''} onclick="renderizarPagina(${paginaActual + 1})">
                <i class="bi bi-chevron-right"></i>
             </button>`;

    container.innerHTML = html;
}

// ============================================================
// HELPERS DE SEGURIDAD
// Evitan inyección de HTML malicioso en el DOM
// ============================================================

/**
 * Escapa caracteres especiales de HTML para insertar texto seguro como innerHTML.
 * Convierte <, >, &, ", ' en sus entidades HTML equivalentes.
 * @param {*} t - Texto a escapar
 * @returns {string} Texto seguro para usar en innerHTML
 */
function escapeHtml(t) {
    const div = document.createElement('div');
    div.textContent = t == null ? '' : String(t); // textContent no interpreta HTML
    return div.innerHTML; // innerHTML sí escapa los caracteres especiales
}

/**
 * Escapa para usar en atributos HTML (además escapa las comillas dobles).
 * @param {*} t - Texto a escapar
 * @returns {string} Texto seguro para usar en atributos HTML como src, alt, onclick
 */
function escapeAttr(t) {
    return escapeHtml(t).replace(/"/g, '&quot;');
}

// Navega a la página de detalle de un producto pasando el ID en la URL
async function verDetalle(id) {
    window.location.href = `Detalle.html?id=${id}`;
}

// Navega a la página de pago
async function VerPago() {
    window.location.href = "Pagos.html";
}

// ============================================================
// LÓGICA DEL CARRITO
// ============================================================

/**
 * Agrega un producto al carrito o incrementa su cantidad si ya está.
 * Verifica el stock disponible consultando la BD antes de agregar.
 * @param {string} id - ID de MongoDB del producto
 * @param {string} titulo - Nombre del producto
 */
async function agregarAlCarrito(id, titulo) {
    console.log(id);
    try {
        // Consultamos el stock real desde la BD (no confiamos en lo que muestra la tarjeta)
        const res = await fetch(`/productos/${id}`);
        if (!res.ok) throw new Error("Producto no encontrado");
        
        const productoDB = await res.json();
        
        // Verificamos si el producto ya está en el carrito
        const itemExistente = carrito.find(item => item.id === id);

        if (itemExistente) {
            // Si ya está, verificamos que no exceda el stock antes de incrementar
            if (itemExistente.qty + 1 > productoDB.cantidad) {
                alert(`¡No! Solo hay ${productoDB.cantidad} disponibles.`);
                return; 
            }
            itemExistente.qty += 1; // Incrementamos la cantidad
        } else {
            carrito.push({ id: id, titulo: titulo, qty: 1 }); // Lo agregamos con cantidad 1
        }

        guardarYActualizar(); // Sincroniza con la BD y actualiza la interfaz
        document.getElementById('sidebar').classList.add('open'); // Abre el sidebar del carrito
    } catch (error) {
        console.error("Error al verificar cantidades:", error);
        alert("Error al conectar con la base de datos de productos.");
    }
}

/**
 * Incrementa o decrementa la cantidad de un producto en el carrito.
 * Verifica el stock si se está incrementando.
 * @param {number} index - Posición del producto en el array carrito
 * @param {number} delta - +1 para aumentar, -1 para disminuir
 */
async function cambiarCantidad(index, delta) {
    const item = carrito[index];
    const nuevaCantidad = item.qty + delta;

    if (nuevaCantidad < 1) return; // No permite cantidades menores a 1

    try {
        const res = await fetch(`/productos/${item.id}`);
        const productoDB = await res.json();

        // Verificamos el stock solo si estamos aumentando la cantidad
        if (nuevaCantidad > productoDB.cantidad) {
            alert(`Lo sentimos, solo quedan ${productoDB.cantidad} piezas.`);
            return;
        }

        item.qty = nuevaCantidad;
        guardarYActualizar(); // Actualiza BD e interfaz
    } catch (e) { console.error("Error al validar", e); }
}

// Elimina un producto del carrito por su índice en el array
function eliminarDelCarrito(index) {
    carrito.splice(index, 1); // Elimina 1 elemento en la posición index
    guardarYActualizar();
}

/**
 * Guarda el carrito en MongoDB y en localStorage, luego actualiza la interfaz.
 * Se llama cada vez que hay un cambio en el carrito.
 */
function guardarYActualizar() {
    GuardarCarritoConcurrentDB(); // Sincroniza con MongoDB de forma asíncrona
    console.log("usuario a guardar cambio", idUser);
    console.log("carrito de usuario cargado asi:", carrito);
    // Guardamos también en localStorage como respaldo local
    localStorage.setItem(`cart_user_${idUser}`, JSON.stringify(carrito));
    actualizarInterfazCarrito(); // Refresca el sidebar del carrito
}

/**
 * Sincroniza el carrito local con MongoDB de forma asíncrona.
 * No bloquea la UI — se ejecuta en segundo plano.
 * Si el usuario no está logueado (no hay idUser), no hace nada.
 */
async function GuardarCarritoConcurrentDB() {
    if (!idUser) return; // No guardamos si no hay usuario logueado

    try {
        const payload = {
            idUsuario: idUser,
            items: carrito // Array completo de objetos {id, titulo, qty}
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
 * Actualiza completamente la interfaz del sidebar del carrito.
 * Consulta al servidor los precios y stock actuales de cada producto,
 * renderiza los items y actualiza el total.
 */
async function actualizarInterfazCarrito() {
    console.log("tamaño del carrito", carrito.length, JSON.stringify(carrito));
    const list = document.getElementById('cart-list');
    const totalDisplay = document.getElementById('cart-total');
    const subtotalDisplay = document.getElementById('cart-subtotal');
    const badge = document.getElementById('cart-badge');

    // Actualizamos el badge (número de piezas totales) siempre, incluso con carrito vacío
    if (badge) {
        const totalPiezas = carrito.reduce((sum, item) => sum + Number(item.qty || 0), 0);
        badge.innerText = totalPiezas;
    }

    // Si el carrito está vacío, mostramos el mensaje y ponemos totales en $0
    if (carrito.length === 0) {
        if (list) list.innerHTML = `<p style="text-align:center; padding:20px;">Carrito vacío</p>`;
        if (totalDisplay) totalDisplay.innerText = "$0.00";
        if (subtotalDisplay) subtotalDisplay.innerText = "$0.00";
        return;
    }

    // Preparamos los items en el formato que espera el endpoint /carrito/detalle
    const itemsParaServer = carrito.map(i => ({ id: i.id, cantidad: i.qty }));

try {
    // Pedimos al servidor los detalles actualizados de cada producto
    // (precios reales, stock disponible, etc.)
    const res = await fetch('/carrito/detalle', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ items: itemsParaServer })
    });
    const data = await res.json();

    if (!list) return;

    // Generamos el HTML de cada item del carrito de forma asíncrona (para las imágenes de S3)
    const promesasHtml = data.items.map(async (item, i) => {
        const imgSrc = await cargarImagenURL(item.imagen); // URL firmada de S3
        
        // Mensaje de advertencia si el stock es insuficiente para la cantidad solicitada
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

    // Esperamos a que se generen todos los HTML y los insertamos de una vez
    const itemsHtml = await Promise.all(promesasHtml);
    list.innerHTML = itemsHtml.join('');

        // Mostramos el total (calculado por el servidor con precios reales de la BD)
        const totalFormateado = `$${Number(data.total).toFixed(2)}`;
        if (totalDisplay) totalDisplay.innerText = totalFormateado;
        if (subtotalDisplay) subtotalDisplay.innerText = totalFormateado;

        // Sincronizamos los títulos locales con los de la BD (por si cambiaron)
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
 * Llama al endpoint /auth/logout del servidor (que limpia la sesión de Passport).
 * Sigue la redirección que el servidor envía de vuelta.
 */
async function CerrarCarrito(){
    try{
            // Usamos GET con credentials: 'include' para que se envíen las cookies de sesión
        fetch('/auth/logout', {
        method: 'GET',
        credentials: 'include' 
        })
        .then(response => {
            if (response.redirected) {
            // El servidor redirigió (a la página principal) — seguimos esa URL
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

// ============================================================
// BÚSQUEDA DE PRODUCTOS
// ============================================================

/**
 * Busca productos por título usando la API del servidor.
 * Lee el término del campo de búsqueda y muestra los resultados
 * reemplazando el catálogo actual.
 */
async function BuscarFunco() {
    const valorServer = document.getElementById("search-input").value;

    try {
        // El servidor usa regex de MongoDB para búsqueda flexible (case-insensitive)
        const res = await fetch(`/Retorno?FunkitoBuscadito=${encodeURIComponent(valorServer)}`);
        const data = await res.json();
        const headCatalog = document.getElementById("search-catalog");

        // Mostramos el encabezado con los resultados encontrados
        if (data.length === 0) {
            headCatalog.innerText = `No hay resultados para la búsqueda: "${valorServer}"`;
        } else {
            headCatalog.innerText = `Resultados para la búsqueda: "${valorServer}"`;
        }

        const catalog = document.getElementById('catalog');

        // Generamos las tarjetas de resultados (asíncrono por las URLs de S3)
        const promesasProductos = data.map(async (f) => {
            const agotado = Number(f.cantidad) === 0;
            const imgSrc = await cargarImagenURL(f.imagen);
            console.log("img src buscado", imgSrc);

            return `
                <div class="product-card ${agotado ? 'product-card-agotado' : ''}">
                    <img src="${imgSrc}"
                         alt="${escapeAttr(f.titulo)}"
                         onclick="verDetalle('${f._id}')"
                         onerror="this.src='https://via.placeholder.com/250x300/f8f8f8/333?text=${encodeURIComponent(f.titulo)}'">

                    ${agotado ? '<span class="badge-agotado">AGOTADO</span>' : ''}

                    <div class="card-info">
                        <h4>${escapeHtml(f.titulo)}</h4>
                        <span class="stock-info">
                            ${agotado ? 'Sin existencias' : `Stock disponible: ${f.cantidad}`}
                        </span>
                        <div class="price-row">
                            <span class="price">$${Number(f.precio).toFixed(2)}</span>
                            
                            <button
                                class="btn-add-modern"
                                ${agotado ? 'disabled' : ''}
                                onclick="agregarAlCarrito('${f._id}', '${escapeAttr(f.titulo)}')"
                                title="${agotado ? 'Agotado' : 'Añadir al carrito'}"
                            >
                                <i class="bi ${agotado ? 'bi-x-circle' : 'bi-cart-plus'}"></i>
                            </button>
                        </div>
                    </div>
                </div>`;
        });

        // Esperamos a que se generen todos y los insertamos
        const productosHtml = await Promise.all(promesasProductos);
        catalog.innerHTML = productosHtml.join('');

    } catch (e) { 
        console.error("Error en la busqueda:", e); 
    }
}

/**
 * Obtiene la URL firmada de S3 para una imagen de producto.
 * El servidor genera la URL temporal con getSignedUrl de AWS.
 * @param {string} keyimagen - Nombre/key del archivo en S3
 * @returns {string} URL temporal con acceso a la imagen
 */
async function cargarImagenURL(keyimagen){
    const res = await fetch(`/files/${keyimagen}`);
    const data = await res.json();
    return data.url;
}

// --- LÓGICA DEL CARRUSEL DEL HOME (INTERACTIVO Y DINÁMICO) ---
document.addEventListener('DOMContentLoaded', () => {
    const slides = document.querySelectorAll('.carousel-slide');
    const dotsContainer = document.getElementById('carousel-dots');
    const prevBtn = document.querySelector('.carousel-control.prev');
    const nextBtn = document.querySelector('.carousel-control.next');
    
    if (slides.length === 0 || !dotsContainer) return;

    let currentSlide = 0;
    const slideIntervalTime = 5000;
    let slideTimer;
    let dots = []; // Aquí guardaremos los puntos generados

    // 1. Generar los puntos dinámicamente
    slides.forEach((_, index) => {
        const dot = document.createElement('span');
        dot.classList.add('dot');
        if (index === 0) dot.classList.add('active'); // El primero empieza activo
        
        // Agregar evento de clic a cada punto
        dot.addEventListener('click', () => {
            goToSlide(index);
            resetTimer();
        });

        dotsContainer.appendChild(dot);
        dots.push(dot); // Lo guardamos en nuestro array
    });

    // 2. Función principal para cambiar de imagen
    const goToSlide = (index) => {
        slides[currentSlide].classList.remove('active');
        dots[currentSlide].classList.remove('active');
        
        currentSlide = index;
        if (currentSlide < 0) currentSlide = slides.length - 1;
        if (currentSlide >= slides.length) currentSlide = 0;
        
        slides[currentSlide].classList.add('active');
        dots[currentSlide].classList.add('active');
    };

    const nextSlide = () => {
        goToSlide(currentSlide + 1);
    };

    const resetTimer = () => {
        clearInterval(slideTimer);
        slideTimer = setInterval(nextSlide, slideIntervalTime);
    };

    // 3. Eventos de las flechas
    if (prevBtn && nextBtn) {
        prevBtn.addEventListener('click', () => {
            goToSlide(currentSlide - 1);
            resetTimer();
        });

        nextBtn.addEventListener('click', () => {
            goToSlide(currentSlide + 1);
            resetTimer();
        });
    }

    resetTimer();
});
