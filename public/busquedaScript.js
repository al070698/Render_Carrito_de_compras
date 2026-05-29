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
        } else {   
            titleEl.innerText = `Resultados para: "${valorServer}"`;
        }

        catalogEl.innerHTML = data.map(f => `
            <div class="product-card">
                <img src="${f.id}.png" alt="${f.titulo}" onerror="this.src='https://via.placeholder.com/250x300/f8f8f8/333?text=${encodeURIComponent(f.titulo)}'" onclick="verDetalle(${f.id})">
                
                <div class="card-info">
                    <h4>${f.titulo}</h4>
                    <span class="stock-info">Stock disponible: ${f.cantidad}</span>
                    <div class="price-row">
                        <span class="price">$${f.precio}</span>
                        
                        <button 
                            class="btn-add-modern" 
                            ${f.cantidad === 0 ? 'disabled' : ''} 
                            onclick="agregarAlCarrito(${f.id}, '${f.titulo}')"
                            title="${f.cantidad === 0 ? 'Agotado' : 'Añadir al carrito'}"
                        >
                            <i class="bi ${f.cantidad === 0 ? 'bi-dash-circle' : 'bi-cart-plus'}"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

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
        } else {   
            titleEl.innerText = `Categoría: ${categoria}`;
        }

        catalogEl.innerHTML = data.map(f => `
            <div class="product-card">
                <img src="${f.id}.png" alt="${f.titulo}" onerror="this.src='https://via.placeholder.com/250x300/f8f8f8/333?text=${encodeURIComponent(f.titulo)}'" onclick="verDetalle(${f.id})">
                
                <div class="card-info">
                    <h4>${f.titulo}</h4>
                    <span class="stock-info">Stock disponible: ${f.cantidad}</span>
                    <div class="price-row">
                        <span class="price">$${f.precio}</span>
                        
                        <button 
                            class="btn-add-modern" 
                            ${f.cantidad === 0 ? 'disabled' : ''} 
                            onclick="agregarAlCarrito(${f.id}, '${f.titulo}')"
                            title="${f.cantidad === 0 ? 'Agotado' : 'Añadir al carrito'}"
                        >
                            <i class="bi ${f.cantidad === 0 ? 'bi-dash-circle' : 'bi-cart-plus'}"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

    } catch (e) { 
        console.error("Error al cargar la categoría:", e); 
        document.getElementById("search-title").innerText = "Ocurrió un error al cargar la categoría.";
    }
}