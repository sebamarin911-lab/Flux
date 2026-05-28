# 🛠️ GUÍA DE MITIGACIÓN DE CADUCIDAD DE REFRESH TOKEN (7 DÍAS) - GCP

Cuando un proyecto de Google Cloud está en estado de publicación **"Testing" (Prueba)**, Google expira todos los tokens de refresco a los 7 días de forma obligatoria por políticas de Sandbox. Para solucionar esto en Flux, sigue estos pasos en la consola:

1. Ingresa a **Google Cloud Console** (https://console.cloud.google.com/) con tu cuenta de desarrollador.
2. Selecciona el proyecto asignado a **Flux**.
3. En el menú lateral izquierdo, navega a **API y servicios** > **Pantalla de consentimiento de OAuth**.
4. Localiza la sección llamada **"Estado de publicación" (Publishing status)**. Actualmente estará marcado como *En prueba (Testing)*.
5. Haz clic en el botón explícito **"PUBLICAR APLICACIÓN" (PUBLISH APP)**.
6. Google te mostrará un cuadro de diálogo de advertencia indicando que la aplicación requerirá verificación y que se mostrará una pantalla de aviso a los usuarios (Unverified App). **Ignora la advertencia y confirma haciendo clic en "Confirmar / Continuar"**.
7. **Resultado Exigido:** El estado de publicación cambiará a **"En producción" (In Production)**. Al pasar a este estado, el límite de caducidad de 7 días se elimina por completo para tu cuenta personal, y el `google_refresh_token` almacenado en Supabase pasará a ser perpetuo.
