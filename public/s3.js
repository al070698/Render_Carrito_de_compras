// ============================================================
// public/s3.js — Módulo de integración con AWS S3
// Maneja todas las operaciones de archivos: subir, listar,
// obtener, descargar y generar URLs firmadas temporales.
// ============================================================

import { S3Client, PutObjectCommand, ListObjectsCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import {AWS_BUCKET_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_BUCKET_NAME} from './config.js'
import fs from 'fs'
import {getSignedUrl} from '@aws-sdk/s3-request-presigner' // Genera URLs temporales firmadas


// Creamos el cliente de S3 con las credenciales del .env
// Este objeto se reutiliza en todas las operaciones
const client = new S3Client({
    region: AWS_BUCKET_REGION,
    credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
    }
})

/**
 * Sube un archivo al bucket de S3.
 * @param {Object} file - Objeto de archivo que viene de express-fileupload
 *                        (tiene: tempFilePath, name, size, mimetype, etc.)
 */
export async function uploadFile(file){
    // Leemos el archivo desde su ruta temporal (donde express-fileupload lo guardó)
    const stream = fs.createReadStream(file.tempFilePath)
    const uploadParams = {
        Bucket: AWS_BUCKET_NAME,  // Nombre del bucket destino
        Key: file.name,           // Nombre con el que se guarda en S3 (funciona como ruta)
        Body: stream              // Contenido del archivo como stream
    }
    const command = new PutObjectCommand(uploadParams)
    const result = await client.send(command) // Ejecuta la subida
    console.log("Archivo subido exitosamente:", result)
}

/**
 * Lista todos los objetos almacenados en el bucket.
 * @returns {Object} Respuesta de S3 con un array en .Contents con todos los objetos
 */
export async function getFiles(){
    const command = new ListObjectsCommand({
        Bucket: AWS_BUCKET_NAME
    })
    return await client.send(command) // El llamador accede a result.Contents
}

/**
 * Obtiene un objeto de S3 (sin descargarlo al servidor).
 * @param {string} fileName - Key (nombre) del archivo en S3
 * @returns {Object} Respuesta de S3 con metadatos y Body como stream
 */
export async function getFile(fileName){
    const command = new GetObjectCommand({
        Bucket: AWS_BUCKET_NAME,
        Key: fileName
    })
    return await client.send(command)
}

/**
 * Descarga un archivo de S3 y lo guarda en la carpeta ./images/ del servidor.
 * @param {string} fileName - Key (nombre) del archivo en S3
 */
export async function downloadFile(fileName){
    const command = GetObjectCommand({ // ⚠️ Nota: falta 'new' aquí (bug conocido)
        Bucket: AWS_BUCKET_NAME,
        Key: fileName
    })
    const result = await client.send(command)
    console.log(result)
    // Pipe: escribe el stream de S3 directamente en un archivo local
    result.Body.pipe(fs.createWriteStream(`./images/${fileName}`))
}

/**
 * Genera una URL prefirmada (signed URL) temporal para un archivo de S3.
 * Permite al frontend acceder directamente a archivos privados del bucket
 * sin exponer las credenciales de AWS.
 * @param {string} fileName - Key (nombre) del archivo en S3
 * @returns {string} URL temporal con acceso al archivo (expira en 1 hora)
 */
export async function getFileURL(fileName){
    const command = new GetObjectCommand({
        Bucket: AWS_BUCKET_NAME,
        Key: fileName
    })
    // expiresIn: 3600 segundos = 1 hora de validez para la URL
    return await getSignedUrl(client, command, {expiresIn: 3600})
}
