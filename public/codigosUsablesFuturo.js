// Este archivo contiene código experimental/no implementado — se conserva como referencia
//no implementado 
async function guardarVenta() {
    const idss = carrito.map(i => i.id);
    const namesid = carrito.map(i => String(i.id));
    const names = carrito.map(i => String(i.titulo));
    const cantidades = carrito.map(i => String(i.qty));
    const cantidadesNum = carrito.map(i => parseInt(i.qty));

    try {
        
        for (let i = 0; i < idss.length; i++) {
            
            let cantidadOLD = parseInt( await obtenerDetallesProducto(idss[i])); 
            if(!cantidadOLD || cantidadOLD < cantidadesNum[i]){
                alert(`error con el producto ${names[i]}, no se pudo procesar la compra`);
                carrito.splice(i, 1);
                localStorage.setItem(`cart_user_${idUser}`, JSON.stringify(carrito));
                await GuardarCarritoConcurrentDB();
                window.location.href = 'Client.html'; 
                return; 
            }
            
        }

        for (let i = 0; i < idss.length; i++) {
            let cantidadOLD = parseInt( await obtenerDetallesProducto(idss[i])); 
            let cantidadNew = cantidadOLD - cantidadesNum[i];
            await actualizarInventario(idss[i],cantidadNew);
        }

        
        carrito = []; 
        localStorage.setItem(`cart_user_${idUser}`, JSON.stringify(carrito));
        await GuardarCarritoConcurrentDB();
        GuardarCompraDB(namesid, cantidades); 
        window.location.href = 'Client.html'; 

        
    } catch (error) {
        console.error("Error de red:", error);
    }
};

//todavia 
async function GuardarCompraDB(namesid,cantidades) {
     const datosCompra = {
        Status: 'Completado',
        Productos: namesid, 
        Cantidades: cantidades,
        Total: TotalGLOB,
        id: idUser // El ID del usuario o de la compra
    };

    try {

        const respuesta = await fetch('/GuardarCompra', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(datosCompra)
        });

        if (respuesta.ok) {
            const resultado = await respuesta.json();
            console.log("Compra guardada con éxito:", resultado);
            alert("¡Compra guardada!");
        } else {
            const errorData = await respuesta.json();
            console.error("Error del servidor:", errorData.detalle);
            alert("Error al guardar: " + errorData.detalle);
        }
        
    } catch (error) {
        
    }
}

async function obtenerDetallesProducto(idProducto) {
    try {
        // El ID va directamente en la URL: /productos/5
        const respuesta = await fetch(`/productos/${idProducto}`);

        if (respuesta.ok) {
            const producto = await respuesta.json();
            console.log("Datos del Funko:", producto);
            cantidad = parseInt(producto.cantidad); 
            return cantidad; 
            // Ejemplo: Pintar el nombre en el HTML
            // document.getElementById('nombre-prod').innerText = producto.nombre;
        } else if (respuesta.status === 404) {
            console.error("El producto no existe en la base de datos");
            return null; 
        }
    } catch (error) {
        console.error("Error de conexión:", error);
        return null; 
    }
};


async function actualizarInventario(idProducto, nuevaCantidad) {
    // Los nombres deben coincidir con: const { id, cantidadnueva } = req.body;
    const datosCuerpo = {
        id: idProducto,
        cantidadnueva: nuevaCantidad
    };

    try {
        const respuesta = await fetch('/ActualizarProdDB', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(datosCuerpo)
        });

        if (respuesta.ok) {
            console.log("Stock actualizado correctamente en la base de datos");
            // Aquí podrías recargar la tabla de productos o mostrar un mensaje
        } else {
            const errorServer = await respuesta.json();
            console.error("Hubo un problema:", errorServer.error);
        }
    } catch (error) {
        console.error("Error al conectar con el servidor:", error);
    }
};


async function GuardarCarritoConcurrentDB(){
    
    try{
        const ids = carrito.map(i => String(i.id));
        const cantidades = carrito.map(i => String(i.qty));
        const payload = {
            Products: ids,
            Cantidad: cantidades,
            total:10.00,
            id: idUser
            };

            // Llamada al endpoint
        fetch('/ActualizarCarritoDB', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error("Error en la respuesta del servidor");
            }
            return response.json();
        })
        .then(data => {
            console.log("Carrito actualizado:", data);
                
        })
        .catch(error => {
            console.error("Error al llamar al endpoint:", error);
        })

    }catch(error){
        console.log("error al guardar el carrito actualizado en la base");
    }

}