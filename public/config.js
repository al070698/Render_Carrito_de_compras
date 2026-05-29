// ============================================================
// public/config.js — Variables de configuración del proyecto
// Lee los valores del archivo .env y los exporta para que
// otros archivos (Server.js, s3.js) los puedan importar.
// ============================================================

import {config} from 'dotenv'

config() // Carga el archivo .env en process.env

// Exportamos cada variable de entorno con un nombre descriptivo
export const AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME           // Nombre del bucket de S3
export const AWS_BUCKET_REGION = process.env.AWS_BUCKET_REGION       // Región donde está el bucket (ej: us-east-1)
export const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID       // Clave de acceso de IAM
export const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY // Clave secreta de IAM
export const DATABASE = process.env.DATABASE                          // URL de conexión a MongoDB
