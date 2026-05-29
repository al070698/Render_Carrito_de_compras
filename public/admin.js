/**
 * admin.js — Lógica del panel de administración.
 *
 * Funcionalidad:
 *   - Verifica que el usuario sea admin (sino, redirige al inicio)
 *   - Dashboard de estadísticas
 *   - CRUD de productos (crear, leer, actualizar, eliminar)
 *   - Listado y filtrado de todas las compras
 */

// ============================================================
// INICIALIZACIÓN
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Primero verificamos si el usuario es admin antes de cargar nada
    const esAdmin = await verificarAdmin();
    if (!esAdmin) return; // verificarAdmin ya redirigió al inicio si no es admin

    // Si llegamos aquí, el usuario es admin — cargamos el panel
    document.getElementById('tab-productos').style.display = 'block'; // Mostramos la tab de productos por defecto
    await cargarStats();     // Cargamos las métricas del dashboard
    await cargarProductos(); // Cargamos la tabla de productos
});


// ============================================================
// VERIFICACIÓN DE PERMISOS
// ============================================================

/**
 * Verifica que el usuario logueado tenga rol 'admin'.
 * Si no está logueado o no es admin, lo redirige al inicio y retorna false.
 * @returns {boolean} true si es admin, false si no
 */
async function verificarAdmin() {
    try {
        const res = await fetch('/auth/whoami'); // Consultamos quién está logueado
        if (!res.ok) {
            // No hay sesión activa
            alert('Debes iniciar sesión.');
            window.location.href = 'Client.html';
            return false;
        }
        const user = await res.json();
        if (user.rol !== 'admin') {
            // Está logueado pero no tiene rol admin
            alert('No tienes permisos de administrador.');
            window.location.href = 'Client.html';
            return false;
        }

        // Mostramos el email del admin en el header del panel
        const span = document.getElementById('admin-name');
        if (span) span.textContent = user.email;

        return true; // Es admin, puede continuar
    } catch (error) {
        console.error('Error al verificar admin:', error);
        window.location.href = 'Client.html'; // Ante cualquier error, redirigimos al inicio
        return false;
    }
}


// ============================================================
// DASHBOARD DE ESTADÍSTICAS
// ============================================================

/**
 * Carga y muestra las métricas del dashboard:
 * - Total de productos en catálogo
 * - Compras completadas
 * - Total de compras
 * - Productos agotados
 * - Ventas totales en MXN
 */
async function cargarStats() {
    try {
        const res = await fetch('/admin/stats'); // Endpoint del servidor que calcula las métricas
        if (!res.ok) throw new Error('No se pudieron cargar las estadísticas');
        const stats = await res.json();

        // Inyectamos las tarjetas de estadísticas en el grid del dashboard
        const grid = document.getElementById('stats-grid');
        grid.innerHTML = `
            <div class="stat-card blue">
                <div class="stat-label">Productos en catálogo</div>
                <div class="stat-value">${stats.totalProductos}</div>
            </div>
            <div class="stat-card green">
                <div class="stat-label">Compras completadas</div>
                <div class="stat-value">${stats.comprasCompletadas}</div>
            </div>
            <div class="stat-card orange">
                <div class="stat-label">Total de compras</div>
                <div class="stat-value">${stats.totalCompras}</div>
            </div>
            <div class="stat-card red">
                <div class="stat-label">Productos agotados</div>
                <div class="stat-value">${stats.productosAgotados}</div>
            </div>
            <div class="stat-card green">
                <div class="stat-label">Ventas totales</div>
                <div class="stat-value">$${formatearPrecio(stats.ventasTotales)}</div>
            </div>
        `;
    } catch (error) {
        console.error('Error al cargar stats:', error);
    }
}


// ============================================================
// SISTEMA DE TABS (Productos / Compras)
// ============================================================

/**
 * Cambia entre las tabs del panel de administración.
 * Activa visualmente el botón de la tab seleccionada y muestra su contenido.
 * Si se abre la tab de compras, las carga en ese momento (carga diferida/lazy).
 * @param {string} nombre - 'productos' o 'compras'
 */
function cambiarTab(nombre) {
    // Quitamos la clase 'active' de todos los botones de tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    // Activamos solo el botón de la tab seleccionada
    document.getElementById(`tab-${nombre}-btn`).classList.add('active');

    // Mostramos el contenido de la tab seleccionada y ocultamos la otra
    document.getElementById('tab-productos').style.display = nombre === 'productos' ? 'block' : 'none';
    document.getElementById('tab-compras').style.display = nombre === 'compras' ? 'block' : 'none';

    // Carga diferida: solo cargamos los datos cuando el usuario abre esa tab
    if (nombre === 'compras') cargarCompras();
    if (nombre === 'productos') cargarProductos();
}


// ============================================================
// GESTIÓN DE PRODUCTOS (CRUD)
// ============================================================

// Cache de productos cargados — usado por la función editarProducto para
// pre-rellenar el modal sin hacer un fetch adicional
let productosCache = [];


/**
 * Carga todos los productos desde el servidor y los muestra en la tabla del admin.
 * Genera un "pill" de color según el nivel de stock de cada producto.
 */
async function cargarProductos() {
    console.log("si carga la funcion"); 
    const tbody = document.getElementById('productos-tbody');
    try {
        const res = await fetch('/admin/productos'); // Endpoint protegido por requireAdmin
        if (!res.ok) throw new Error('Error al cargar');
        const productos = await res.json();
        productosCache = productos; // Guardamos en cache para editarProducto()

        console.log("productos numero: ", productos.length, productos)
        if (productos.length === 0) {
            // Mostramos un mensaje si no hay productos
            tbody.innerHTML = `
                <tr><td colspan="6" class="empty-state">
                    <i class="bi bi-inbox"></i>
                    No hay productos. ¡Agrega el primero!
                </td></tr>
            `;
            return;
        }

        console.log("antes del mapeo");

        // Generamos las filas de la tabla de forma asíncrona (necesitamos await para las imágenes)
        const filasPromesas = productos.map(async (p) => {
            const agotado = Number(p.cantidad) === 0;

            // Pill de color según el nivel de stock
            const stockPill = agotado
                ? '<span class="pill pill-red">Agotado</span>'            // Rojo si no hay stock
                : Number(p.cantidad) < 5
                    ? `<span class="pill pill-orange">Bajo (${p.cantidad})</span>` // Naranja si hay poco
                    : `<span class="pill pill-green">${p.cantidad}</span>`; // Verde si hay suficiente
            
            const imgSrc = await cargarImagenURL(p.imagen); // URL firmada de S3
            
            return `
                <tr>
                    <td>
                        <img src="${imgSrc}" alt="${escapeHtml(p.titulo)}" class="img-thumb"
                             onerror="this.src='https://via.placeholder.com/44x44/eee/999?text=F'">
                    </td>
                    <td><strong>${escapeHtml(p.titulo)}</strong></td>
                    <td>$${Number(p.precio).toFixed(2)}</td>
                    <td>${p.cantidad}</td>
                    <td>${stockPill}</td>
                    <td>
                        <button class="btn-admin btn-edit" onclick="editarProducto('${p._id}')">
                            <i class="bi bi-pencil"></i> Editar
                        </button>
                        <button class="btn-admin btn-delete" onclick="eliminarProducto('${p._id}', '${escapeAttr(p.titulo)}')">
                            <i class="bi bi-trash"></i> Eliminar
                        </button>
                    </td>
                </tr>
            `;
        });

        // Esperamos a que se generen todas las filas y las insertamos de una vez
        const filasHtml = await Promise.all(filasPromesas);
        tbody.innerHTML = filasHtml.join('');

        console.log("despues del mapeo");
    } catch (error) {
        console.error('Error al cargar productos:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Error al cargar</td></tr>`;
    }
}


/**
 * Abre el modal en modo "Nuevo producto" con todos los campos vacíos.
 */
function abrirModalProducto() {
    document.getElementById('modal-titulo').textContent = 'Nuevo producto';
    // Limpiamos todos los campos del formulario
    document.getElementById('prod-id').value = '';
    document.getElementById('prod-titulo').value = '';
    document.getElementById('prod-precio').value = '';
    document.getElementById('prod-cantidad').value = '';
    document.getElementById('prod-imagen').value = '';
    document.getElementById('prod-descripcion').value = '';
    document.getElementById('prod-categoria').value = ''; // <-- NUEVA LÍNEA
    document.getElementById('modal-producto').classList.add('open'); // Muestra el modal
}

/**
 * Abre el modal en modo "Editar producto" pre-rellenando los campos con los datos del producto.
 * @param {string} id - ID de MongoDB del producto a editar
 */
function editarProducto(id) {
    // Buscamos el producto en el cache local (evitamos un fetch adicional)
    const p = productosCache.find(x => String(x._id) === String(id));
    if (!p) return; // Si no lo encontramos, no hacemos nada

    document.getElementById('modal-titulo').textContent = 'Editar producto';
    // Pre-rellenamos el formulario con los datos del producto
    document.getElementById('prod-id').value = p._id;         // ID oculto para saber qué actualizar
    document.getElementById('prod-titulo').value = p.titulo || '';
    document.getElementById('prod-precio').value = p.precio || '';
    document.getElementById('prod-cantidad').value = p.cantidad || 0;
    document.getElementById('prod-imagen').value = p.imagen || '';
    document.getElementById('prod-descripcion').value = p.descripcion || '';
    document.getElementById('prod-categoria').value = p.categoria || '';
    document.getElementById('modal-producto').classList.add('open'); // Muestra el modal
}

// Cierra el modal de crear/editar producto
function cerrarModalProducto() {
    document.getElementById('modal-producto').classList.remove('open');
}


/**
 * Guarda un producto (crea o actualiza según si hay ID en el campo oculto).
 * Si hay un archivo de imagen seleccionado, primero lo sube a S3 y usa la key resultante.
 * Valida que los campos obligatorios estén completos antes de guardar.
 */
async function guardarProducto() {
    const id = document.getElementById('prod-id').value; // Si hay ID, es una edición
    const fileInput = document.getElementById('file');
    const archivoSeleccionado = fileInput && fileInput.files && fileInput.files[0];

    // El nombre de la imagen puede venir del campo de texto o de un archivo subido
    let nombreImagen = document.getElementById('prod-imagen').value.trim();

    // Si hay un archivo seleccionado, lo subimos primero a S3 antes de guardar el producto
    if (archivoSeleccionado) {
        try {
            const formData = new FormData();
            formData.append('file', archivoSeleccionado);

            // Subimos el archivo al endpoint /files (que lo manda a S3)
            const resUpload = await fetch('/files', {
                method: 'POST',
                body: formData
                // ⚠️ No pongas Content-Type — el navegador lo pone solo con el boundary correcto
            });

            if (!resUpload.ok) {
                const errUpload = await resUpload.json().catch(() => ({}));
                throw new Error(errUpload.error || 'Error al subir la imagen');
            }

            const dataUpload = await resUpload.json();
            // El endpoint devuelve la key del archivo en S3 — la usamos como referencia en la BD
            nombreImagen = dataUpload.key || archivoSeleccionado.name;

        } catch (error) {
            alert('Error al subir imagen: ' + error.message);
            return; // Detenemos si falla la subida de imagen
        }
    }

    // Armamos el objeto con los datos del formulario
    const payload = {
        titulo: document.getElementById('prod-titulo').value.trim(),
        precio: document.getElementById('prod-precio').value,
        cantidad: document.getElementById('prod-cantidad').value,
        imagen: nombreImagen,
        descripcion: document.getElementById('prod-descripcion').value.trim(),
        categoria: document.getElementById('prod-categoria').value
    };

    // Validamos los campos obligatorios
    if (!payload.titulo || payload.precio === '' || payload.cantidad === '') {
        alert('Título, precio y stock son obligatorios.');
        return;
    }

    try {
        // Si hay ID → PUT (actualizar), si no hay → POST (crear nuevo)
        const url = id ? `/admin/productos/${id}` : '/admin/productos';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Error al guardar');
        }

        cerrarModalProducto();  // Cerramos el modal
        cargarProductos();      // Recargamos la tabla con los datos actualizados
        cargarStats();          // Actualizamos las métricas del dashboard
    } catch (error) {
        alert('Error: ' + error.message);
    }
}


/**
 * Elimina un producto después de pedir confirmación al usuario.
 * También elimina el producto de los carritos de todos los usuarios (lo hace el servidor).
 * @param {string} id - ID de MongoDB del producto
 * @param {string} titulo - Nombre del producto (para el mensaje de confirmación)
 */
async function eliminarProducto(id, titulo) {
    // Pedimos confirmación antes de eliminar (acción irreversible)
    if (!confirm(`¿Eliminar "${titulo}"?\nEsta acción no se puede deshacer.`)) return;

    try {
        const res = await fetch(`/admin/productos/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar');
        cargarProductos(); // Recargamos la tabla
        cargarStats();     // Actualizamos las métricas
    } catch (error) {
        alert('Error al eliminar: ' + error.message);
    }
}


// ============================================================
// GESTIÓN DE COMPRAS
// ============================================================

/**
 * Carga todas las compras desde el servidor y las muestra en la tabla del admin.
 * Soporta filtrado por status (Completado, Pendiente, Fallido).
 * Cada fila es expandible para ver el detalle de los productos de la compra.
 */
async function cargarCompras() {
    const tbody = document.getElementById('compras-tbody');
    const status = document.getElementById('filtro-status').value; // Filtro seleccionado
    // Si hay filtro, lo mandamos como query param; si no, pedimos todas
    const url = status ? `/admin/compras?status=${status}` : '/admin/compras';

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Error al cargar');
        const compras = await res.json();

        if (compras.length === 0) {
            // Mostramos mensaje si no hay compras (o no hay con ese filtro)
            tbody.innerHTML = `
                <tr><td colspan="6" class="empty-state">
                    <i class="bi bi-receipt"></i>
                    No hay compras${status ? ` con estado "${status}"` : ''}.
                </td></tr>
            `;
            return;
        }

        // Generamos dos filas por cada compra:
        // 1. Fila principal (resumen): ID, cliente, fecha, total, status
        // 2. Fila de detalle (oculta): productos, cantidades, subtotal, envío
        tbody.innerHTML = compras.map((c, idx) => {
            const shortId = String(c._id).slice(-6).toUpperCase(); // Últimos 6 chars del ID de MongoDB
            const fecha = c.fecha
                ? new Date(c.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
                : '—';
            
            // Color del pill de status según el valor
            const pillClass =
                c.status === 'Completado' ? 'pill-green' :
                c.status === 'Pendiente'  ? 'pill-orange' :
                c.status === 'Fallido'    ? 'pill-red' : 'pill-gray';
            
            // Info del cliente — puede ser null si el usuario fue eliminado de la BD
            const cliente = c.usuario
                ? `<strong>${escapeHtml(c.usuario.nombre)}</strong><br><small style="color:#999;">${escapeHtml(c.usuario.email)}</small>`
                : '<em style="color:#999;">Usuario eliminado</em>';

            // Lista de productos comprados con su cantidad y precio
            const productosHTML = (c.productos || []).map(p => `
                <li>${escapeHtml(p.titulo)} — Cant: ${p.cantidad} — $${Number(p.precio || 0).toFixed(2)}</li>
            `).join('');

            return `
                <!-- Fila principal (resumen) — clic para expandir/contraer -->
                <tr class="compra-row expandable" onclick="toggleDetalleCompra(${idx})">
                    <td><strong>#${shortId}</strong></td>
                    <td>${cliente}</td>
                    <td>${fecha}</td>
                    <td>$${Number(c.total).toFixed(2)}</td>
                    <td><span class="pill ${pillClass}">${c.status}</span></td>
                    <td>
                        <i class="bi bi-chevron-down" id="chev-${idx}"></i>
                    </td>
                </tr>
                <!-- Fila de detalle (oculta por defecto, se muestra con toggleDetalleCompra) -->
                <tr class="compra-detail-row" id="detalle-${idx}">
                    <td colspan="6">
                        <div class="compra-detail-content">
                            <div style="display:flex; gap:24px; flex-wrap:wrap;">
                                <div>
                                    <strong>Productos:</strong>
                                    <ul>${productosHTML}</ul>
                                </div>
                                <div>
                                    <strong>Resumen:</strong>
                                    <ul style="list-style:none; padding-left:0;">
                                        <li>Subtotal: $${Number(c.subtotal || 0).toFixed(2)}</li>
                                        <li>Envío: $${Number(c.envio || 0).toFixed(2)}</li>
                                        <li><strong>Total: $${Number(c.total).toFixed(2)}</strong></li>
                                        ${c.mp_payment_id ? `<li style="margin-top:6px;"><small>MP Payment ID: <code>${c.mp_payment_id}</code></small></li>` : ''}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Error al cargar compras:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Error al cargar</td></tr>`;
    }
}

/**
 * Alterna la visibilidad del detalle de una compra en la tabla.
 * También cambia el ícono de la flecha (arriba/abajo) para indicar el estado.
 * @param {number} idx - Índice de la compra en la lista (posición en el DOM)
 */
function toggleDetalleCompra(idx) {
    const row = document.getElementById(`detalle-${idx}`);
    const chev = document.getElementById(`chev-${idx}`);
    if (!row) return;

    const open = row.classList.toggle('open'); // toggle devuelve true si la clase fue agregada
    if (chev) {
        // Cambiamos el ícono según si está abierto o cerrado
        chev.classList.toggle('bi-chevron-down', !open); // Flecha abajo si está cerrado
        chev.classList.toggle('bi-chevron-up', open);    // Flecha arriba si está abierto
    }
}


// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

/**
 * Escapa caracteres especiales de HTML para evitar XSS.
 * @param {*} t - Texto a escapar
 * @returns {string} Texto seguro para innerHTML
 */
function escapeHtml(t) {
    const div = document.createElement('div');
    div.textContent = t == null ? '' : String(t);
    return div.innerHTML;
}

/**
 * Escapa para atributos HTML (incluye comillas simples y dobles).
 * @param {*} t - Texto a escapar
 * @returns {string} Texto seguro para atributos HTML
 */
function escapeAttr(t) {
    return escapeHtml(t).replace(/"/g, '&quot;').replace(/'/g, "\\'");
}

/**
 * Formatea un número como precio en formato mexicano con 2 decimales.
 * @param {number} n - Número a formatear
 * @returns {string} Ej: 1234.50 → "1,234.50"
 */
function formatearPrecio(n) {
    return Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
}


/*
// Funciones de prueba comentadas (ya no se usan en producción):

async function cargarImagenProducto(keyimagen){
    const res = await fetch(`/files/${keyimagen}`);
    const data = await res.json();
    console.log("data: ", data.url);
    document.getElementById('miImagen').src = data.url;
    return data.url;
}

async function cargarImagenPrueba2(){
    const url = await cargarImagenURL("Captura de pantalla (1).png");
    console.log("URL obtenida de prueba: ", url);
}
*/

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
