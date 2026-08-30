# Innovación — Pasaporte de Confianza Vecinal

## ¿Qué problema resuelve?

La inseguridad al contratar a un desconocido para un servicio presencial
—dejarlo entrar al hogar, confiarle el cuidado personal o la salud mental—
y, del otro lado, la informalidad de miles de trabajadores independientes en
Chile que no tienen dónde construir una trayectoria verificable más allá de
las reseñas de una app.

## ¿Qué hace diferente a la solución?

El mercado chileno de plataformas de servicios (LiLi, Fixora, Listoco,
Recomendados, Jobbing, entre otras) resuelve la confianza únicamente con
verificación previa a cargo de la propia empresa: identidad y, en algunos
casos, certificación SEC. Ninguna de ellas conecta su verificación con una
institución pública.

ServiciosYa incorpora un nivel de verificación adicional y opcional,
otorgado por la OMIL (Oficina Municipal de Información Laboral) de la
comuna del profesional. Las OMIL —presentes en 326 de las 346 comunas de
Chile— ya exigen, de forma gratuita y rutinaria, cédula de identidad vigente
y Certificado de Antecedentes del Registro Civil para inscribir a cualquier
persona en su bolsa de empleo. ServiciosYa no duplica ese trabajo: lo
reutiliza como un sello de confianza dentro de la plataforma.

## ¿Qué valor agrega?

- Al cliente: una capa de confianza respaldada por una institución pública,
  no solo por la propia empresa.
- Al profesional: una vía de formalización que no depende de que la
  plataforma privada lo certifique por su cuenta, sino de un trámite que ya
  existe y es gratuito.
- Al ecosistema: un puente entre la política pública de empleo municipal y
  el mercado de trabajo independiente digital, que hoy no existe en
  ninguna plataforma chilena del rubro.

## Modelo de implementación (esta iteración del proyecto)

El mecanismo institucional real —un convenio de colaboración entre
ServiciosYa y una municipalidad, siguiendo el mismo modelo que ya usan
portales de empleo municipal como `omil.cl`— excede el alcance de un
semestre académico. Por eso, el proyecto implementa el modelo de datos y la
experiencia de usuario completos, y simula la acción de la OMIL a través del
panel de administración:

1. El profesional se registra normalmente y puede alcanzar el nivel
   "Identidad verificada" mediante IA (`isIdentityVerified`), igual que en
   el resto del mercado.
2. Desde `pages/Admin.jsx`, un administrador (que en un escenario real
   sería personal de la OMIL con acceso a un panel de convenio) activa el
   campo `municipalVerification.active` para ese profesional, indicando la
   comuna que lo certifica.
3. El perfil público del profesional (`ProfesionalProfile.jsx`) muestra
   entonces el sello "Verificado por tu Municipalidad" en lugar del sello
   estándar de identidad, con una descripción de lo que representa.

Este diseño permite demostrar el funcionamiento completo del sistema sin
depender de que un convenio real esté firmado durante el semestre, dejando
la integración institucional real como el siguiente hito de producto fuera
del ciclo académico.

## Extensión a múltiples rubros

La verificación municipal no está limitada a oficios del hogar: el catálogo
de categorías (`src/data/categories.js`) incluye rubros de belleza, arte,
bienestar (psicología, entrenamiento personal), educación, mascotas y
transporte, precisamente porque el mecanismo de verificación de la OMIL no
depende del rubro del trabajador — cualquier persona que busca empleo o
formalizar su actividad pasa por el mismo trámite, independiente de su
oficio.

## Pasaporte municipal ampliado: OMIL, Registro Civil y Migraciones

Además del sello base (identidad + antecedentes), el proyecto simula tres
consultas adicionales que en Chile corresponden a instituciones y trámites
reales distintos entre sí, y que en un escenario de convenio real vendrían
de fuentes de datos separadas:

1. **Inscripción en la OMIL / Bolsa Nacional de Empleo (BNE).**
   Las Oficinas Municipales de Información Laboral inscriben a personas
   cesantes en la BNE (bne.cl) de forma gratuita y presencial, con solo
   cédula de identidad. ServiciosYa simula esta confirmación para reforzar
   el ángulo social del proyecto: dar visibilidad a profesionales que están
   activamente buscando trabajo formal a través del sistema público.

2. **Certificado de Título Profesional (Registro Civil e Identificación).**
   Las universidades e institutos profesionales remiten mensualmente al
   Servicio de Registro Civil e Identificación (SRCeI) la nómina de títulos
   otorgados, por lo que el SRCeI puede certificar carrera, institución y
   nivel (técnico, profesional o universitario) de una persona a partir de
   su RUT, sin que ella deba presentar el documento físico. Es el
   equivalente formal a "verificar estudios" que pedía este hito.

3. **Categoría migratoria (Servicio Nacional de Migraciones).**
   Para profesionales extranjeros, el Servicio Nacional de Migraciones
   certifica su categoría de residencia (Residente Definitivo, Residente
   Temporal, etc.), lo que permite mostrar en el perfil que su situación
   migratoria está regularizada — un punto de fricción real y frecuente en
   plataformas de trabajo informal en Chile.

**Alcance de la simulación:** al igual que con el sello base, no existe
conexión real a BNE, Registro Civil ni Migraciones. Desde `Admin.jsx`, un
administrador simula la consulta ingresando un RUT; el sistema
(`src/data/municipalMockRegistry.js`) devuelve un resultado plausible y
estable para ese RUT — con algunos casos de prueba fijos y un generador
determinístico para cualquier otro— y el administrador decide si otorgar el
sello ampliado con esos datos. El perfil público (`ProfesionalProfile.jsx`)
muestra cada dato confirmado como un sub-sello dentro de la sección de
verificación, sin exponer el RUT ni otros datos sensibles.
