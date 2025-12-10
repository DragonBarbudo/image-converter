const fileInput = document.getElementById("fileInput");
const maxWidthInput = document.getElementById("maxWidth");
const maxHeightInput = document.getElementById("maxHeight");
const convertBtn = document.getElementById("convertBtn");
const statusEl = document.getElementById("status");
const downloadLink = document.getElementById("downloadLink");

const originalPreview = document.getElementById("originalPreview");
const convertedPreview = document.getElementById("convertedPreview");
const originalInfo = document.getElementById("originalInfo");
const convertedInfo = document.getElementById("convertedInfo");

let lastFile = null;

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  lastFile = file || null;
  resetOutput();

  if (!file) return;

  if (!/^image\/(png|jpe?g)$/.test(file.type)) {
    statusEl.textContent =
      "Solo se permiten imágenes PNG o JPG/JPEG.";
    fileInput.value = "";
    lastFile = null;
    return;
  }

  // Mostrar previsualización original
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    originalPreview.src = url;
    originalInfo.textContent = `Dimensiones originales: ${img.width} × ${img.height}px`;
  };
  img.src = url;
});

convertBtn.addEventListener("click", () => {
  if (!lastFile) {
    statusEl.textContent = "Primero selecciona una imagen.";
    return;
  }

  const maxWidth = parseInt(maxWidthInput.value, 10);
  const maxHeight = parseInt(maxHeightInput.value, 10);

  if (Number.isNaN(maxWidth) && Number.isNaN(maxHeight)) {
    statusEl.textContent =
      "Opcional: puedes indicar ancho y/o alto máximo, o dejar ambos vacíos.";
  } else {
    statusEl.textContent = "Convirtiendo...";
  }

  convertBtn.disabled = true;

  fileToWebP(lastFile, {
    maxWidth: Number.isNaN(maxWidth) ? null : maxWidth,
    maxHeight: Number.isNaN(maxHeight) ? null : maxHeight,
    quality: 0.9,
  })
    .then(({ blob, width, height }) => {
      statusEl.textContent = "Conversión completada.";

      // Crear URL para descarga y previsualización
      const webpUrl = URL.createObjectURL(blob);

      convertedPreview.src = webpUrl;
      convertedInfo.textContent = `Dimensiones convertidas: ${width} × ${height}px`;

      // Nombre de archivo
      const baseName =
        lastFile.name.replace(/\.(png|jpe?g)$/i, "") || "imagen";
      downloadLink.href = webpUrl;
      downloadLink.download = `${baseName}.webp`;
      downloadLink.style.display = "inline-block";
    })
    .catch((err) => {
      console.error(err);
      statusEl.textContent = "Ocurrió un error durante la conversión.";
    })
    .finally(() => {
      convertBtn.disabled = false;
    });
});

/**
 * Convierte un File (PNG/JPG) a WebP con tamaño opcional
 * @param {File} file
 * @param {{maxWidth?: number|null, maxHeight?: number|null, quality?: number}} options
 * @returns {Promise<{blob: Blob, width: number, height: number}>}
 */
function fileToWebP(file, options = {}) {
  const { maxWidth = null, maxHeight = null, quality = 0.9 } = options;

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      let { width, height } = img;

      // Calcular factor de escala manteniendo proporción
      let scale = 1;

      if (maxWidth && width > maxWidth) {
        scale = Math.min(scale, maxWidth / width);
      }
      if (maxHeight && height > maxHeight) {
        scale = Math.min(scale, maxHeight / height);
      }

      if (scale < 1) {
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);

          if (!blob) {
            reject(new Error("No se pudo crear el WebP"));
            return;
          }

          resolve({ blob, width, height });
        },
        "image/webp",
        quality
      );
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
}

function resetOutput() {
  statusEl.textContent = "";
  downloadLink.style.display = "none";
  downloadLink.href = "#";
  originalPreview.removeAttribute("src");
  convertedPreview.removeAttribute("src");
  originalInfo.textContent = "";
  convertedInfo.textContent = "";
}