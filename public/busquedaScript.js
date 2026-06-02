document.addEventListener('DOMContentLoaded', () => {
    // Extraer parámetros de la URL
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    const categoria = params.get('categoria'); 
    
    const searchInput = document.getElementById('search-input');
    
    if (query) {
        // FLUJO 1: Búsqueda tradicional por barra de texto
        if (searchInput) searchInput.value = query; 
        EjecutarBusquedaDedicada(query);
    } else if (categoria) {
        // FLUJO 2: Búsqueda filtrada al dar clic en el menú de categorías
        EjecutarBusquedaCategoria(categoria);
    } else {
        // FLUJO 3: Vista vacía si entran sin parámetros
        document.getElementById("search-title").innerText = "Por favor, ingresa un término de búsqueda o selecciona una categoría.";
        document.getElementById("search-catalog").innerHTML = "";
    }
});

// ============================================================
// FUNCIÓN 1: BÚSQUEDA POR TEXTO (Intacta, se conecta a /Retorno)
// ============================================================
async function EjecutarBusquedaDedicada(valorServer) {
    try {
        const res = await fetch(`/Retorno?FunkitoBuscadito=${valorServer}`); 
        const data = await res.json();
        
        const titleEl = document.getElementById("search-title");
        const catalogEl = document.getElementById("search-catalog");

        if (data.length === 0) { 
            titleEl.innerText = `No hay resultados para: "${valorServer}"`;
            catalogEl.innerHTML = ''; // Limpia el catálogo si no hay resultados
            return;
        }    
        
        titleEl.innerText = `Resultados para: "${valorServer}"`;

        // 1. Creamos un arreglo de promesas ejecutando el método asíncrono en cada iteración
        const tarjetasPromesas = data.map(async (f) => {
            // Ejemplo de llamada asíncrona que necesitas (reemplaza 'tuMetodoAsincrono' por el tuyo)
            const imgSrc = await cargarImagenURL(f.imagen);

            return `
                <div class="product-card">
                    <img src="${imgSrc}" alt="${f.titulo}" onerror="this.src=''" onclick="verDetalle('${f._id}')">
                    
                    <div class="card-info">
                        <h4>${f.titulo}</h4>
                        <span class="stock-info">Stock disponible: ${f.cantidad}</span>
                        <div class="price-row">
                            <span class="price">$${f.precio}</span>
                            
                            <button 
                                class="btn-add-modern" 
                                ${f.cantidad === 0 ? 'disabled' : ''} 
                                onclick="agregarAlCarrito('${f._id}', '${f.titulo}')"
                                title="${f.cantidad === 0 ? 'Agotado' : 'Añadir al carrito'}"
                            >
                                <i class="bi ${f.cantidad === 0 ? 'bi-dash-circle' : 'bi-cart-plus'}"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        // 2. Esperamos a que todas las promesas del map se resuelvan
        const htmlTarjetas = await Promise.all(tarjetasPromesas);

        // 3. Unimos el string renderizado y lo inyectamos al DOM
        catalogEl.innerHTML = htmlTarjetas.join('');

    } catch (e) { 
        console.error("Error en la búsqueda:", e); 
        document.getElementById("search-title").innerText = "Ocurrió un error en la búsqueda.";
    }
}



// ============================================================
// FUNCIÓN 2: BÚSQUEDA POR CATEGORÍA (Nueva, se conecta a /RetornoCategoria)
// ============================================================
async function EjecutarBusquedaCategoria(categoria) {
    try {
        // Endpoint que el equipo backend configurará para filtrar por categoría
        const res = await fetch(`/RetornoCategoria?cat=${categoria}`); 
        const data = await res.json();
        
        const titleEl = document.getElementById("search-title");
        const catalogEl = document.getElementById("search-catalog");

        if (data.length === 0) { 
            titleEl.innerText = `Próximamente agregaremos productos a la categoría: "${categoria}"`;
            catalogEl.innerHTML = ''; // Limpia el catálogo si no hay resultados
            return;
        } 
        
        titleEl.innerText = `Categoría: ${categoria}`;

        // 1. Creamos el arreglo de promesas con la función callback asíncrona
        const tarjetasPromesas = data.map(async (f) => {
            // Ejemplo de llamada asíncrona (reemplaza 'tuMetodoAsincrono' por el tuyo)
            const imgSrc = await cargarImagenURL(f.imagen);
            return `
                <div class="product-card">
                    <img src="${imgSrc}" alt="${f.titulo}" onerror="this.src='https://via.placeholder.com/250x300/f8f8f8/333?text=${encodeURIComponent(f.titulo)}'" onclick="verDetalle('${f._id}')">
                    
                    <div class="card-info">
                        <h4>${f.titulo}</h4>
                        <span class="stock-info">Stock disponible: ${f.cantidad}</span>
                        <div class="price-row">
                            <span class="price">$${f.precio}</span>
                            
                            <button 
                                class="btn-add-modern" 
                                ${f.cantidad === 0 ? 'disabled' : ''} 
                                onclick="agregarAlCarrito('${f._id}', '${f.titulo}')"
                                title="${f.cantidad === 0 ? 'Agotado' : 'Añadir al carrito'}"
                            >
                                <i class="bi ${f.cantidad === 0 ? 'bi-dash-circle' : 'bi-cart-plus'}"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        // 2. Esperamos que terminen todas las llamadas asíncronas de la lista
        const htmlTarjetas = await Promise.all(tarjetasPromesas);

        // 3. Renderizamos el string unificado en el contenedor
        catalogEl.innerHTML = htmlTarjetas.join('');

    } catch (e) { 
        console.error("Error al cargar la categoría:", e); 
        document.getElementById("search-title").innerText = "Ocurrió un error al cargar la categoría.";
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
