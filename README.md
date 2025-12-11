# 🖼️ Image to WebP Converter

A Netlify serverless function that converts images to WebP format with optional resizing while maintaining aspect ratio.

## ✨ Features

- 🔄 Convert any image format (JPG, PNG, GIF, TIFF, etc.) to WebP
- 📐 Resize images with aspect ratio preservation
- 🎯 Specify max width OR max height (or both)
- 🚀 Fast processing with Sharp library
- 🌐 Easy-to-use web interface
- ☁️ Serverless deployment on Netlify

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- Netlify account (for deployment)

### Local Development

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd image-converter
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run locally with Netlify Dev**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:8888`

## 📦 Deployment to Netlify

### Option 1: Deploy from Git

1. Push your code to GitHub, GitLab, or Bitbucket
2. Go to [Netlify](https://netlify.com)
3. Click "Add new site" → "Import an existing project"
4. Connect your repository
5. Netlify will auto-detect the configuration from `netlify.toml`
6. Click "Deploy site"

### Option 2: Deploy with Netlify CLI

```bash
# Install Netlify CLI globally
npm install -g netlify-cli

# Login to Netlify
netlify login

# Initialize and deploy
netlify init
netlify deploy --prod
```

## 🔧 API Usage

### Endpoint

```
POST /api/convert-image
```

### Request

Send a `multipart/form-data` POST request with the following fields:

- `image` (required): The image file to convert
- `maxWidth` (optional): Maximum width in pixels
- `maxHeight` (optional): Maximum height in pixels

### Example with cURL

```bash
# Convert without resizing
curl -X POST https://your-site.netlify.app/api/convert-image \
  -F "image=@photo.jpg"

# Convert with max width
curl -X POST https://your-site.netlify.app/api/convert-image \
  -F "image=@photo.jpg" \
  -F "maxWidth=1920"

# Convert with max height
curl -X POST https://your-site.netlify.app/api/convert-image \
  -F "image=@photo.jpg" \
  -F "maxHeight=1080"

# Convert with both (image will fit within bounds)
curl -X POST https://your-site.netlify.app/api/convert-image \
  -F "image=@photo.jpg" \
  -F "maxWidth=1920" \
  -F "maxHeight=1080"
```

### Example with JavaScript

```javascript
const formData = new FormData();
formData.append('image', fileInput.files[0]);
formData.append('maxWidth', '1920');

const response = await fetch('/api/convert-image', {
  method: 'POST',
  body: formData
});

const blob = await response.blob();
const imageUrl = URL.createObjectURL(blob);
```

### Response

- **Success**: Returns the WebP image as binary data with headers:
  - `Content-Type: image/webp`
  - `X-Original-Width`: Original image width
  - `X-Original-Height`: Original image height
  - `X-Final-Width`: Final image width
  - `X-Final-Height`: Final image height

- **Error**: Returns JSON with error details
  ```json
  {
    "error": "Error message",
    "message": "Detailed error information"
  }
  ```

## 📁 Project Structure

```
image-converter/
├── netlify/
│   └── functions/
│       └── convert-image.js    # Serverless function
├── public/
│   └── index.html              # Web interface
├── netlify.toml                # Netlify configuration
├── package.json                # Dependencies
└── README.md                   # This file
```

## 🎨 Resize Behavior

The resizing logic works as follows:

1. **Only maxWidth specified**: Resizes if image width exceeds maxWidth, maintains aspect ratio
2. **Only maxHeight specified**: Resizes if image height exceeds maxHeight, maintains aspect ratio
3. **Both specified**: Ensures image fits within the bounding box while maintaining aspect ratio
4. **Neither specified**: No resizing, only format conversion

## 🔍 Technical Details

- **Image Processing**: Uses [Sharp](https://sharp.pixelplumbing.com/) library for high-performance image processing
- **WebP Quality**: Set to 80 (configurable in the function)
- **Runtime**: Node.js 18+ with esbuild bundler
- **Max File Size**: Limited by Netlify function limits (default 6MB request body)

## 🛠️ Configuration

### Adjust WebP Quality

Edit `netlify/functions/convert-image.js`:

```javascript
.webp({ quality: 80 })  // Change to desired quality (1-100)
```

### Increase Function Timeout

Add to `netlify.toml`:

```toml
[functions]
  node_bundler = "esbuild"
  
[functions."convert-image"]
  timeout = 30  # seconds
```

## 🐛 Troubleshooting

### Sharp Installation Issues

If you encounter issues with Sharp on Netlify:

1. Make sure you're using Node.js 18+
2. Sharp should be installed as a dependency, not devDependency
3. Netlify will automatically use the correct Sharp binary for its environment

### Function Timeout

For very large images, you might need to increase the function timeout in `netlify.toml`.

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
