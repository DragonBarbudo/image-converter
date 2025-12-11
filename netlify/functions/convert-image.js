const sharp = require('sharp');

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' }),
    };
  }

  try {
    // Parse the request body
    const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
    
    if (!contentType.includes('multipart/form-data')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Content-Type must be multipart/form-data',
          usage: 'Send image file with optional maxWidth or maxHeight parameters'
        }),
      };
    }

    // Parse multipart form data
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid multipart/form-data boundary' }),
      };
    }

    const parts = parseMultipartFormData(event.body, boundary, event.isBase64Encoded);
    
    if (!parts.image) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'No image file provided',
          usage: 'Include an image file in the "image" field'
        }),
      };
    }

    // Get resize parameters
    const maxWidth = parts.maxWidth ? parseInt(parts.maxWidth, 10) : null;
    const maxHeight = parts.maxHeight ? parseInt(parts.maxHeight, 10) : null;

    // Validate parameters
    if (maxWidth && (isNaN(maxWidth) || maxWidth <= 0)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'maxWidth must be a positive number' }),
      };
    }

    if (maxHeight && (isNaN(maxHeight) || maxHeight <= 0)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'maxHeight must be a positive number' }),
      };
    }

    // Process the image with sharp
    let pipeline = sharp(parts.image);

    // Get image metadata to determine if resizing is needed
    const metadata = await pipeline.metadata();

    // Calculate resize dimensions if needed
    let resizeOptions = {};
    if (maxWidth || maxHeight) {
      const currentWidth = metadata.width;
      const currentHeight = metadata.height;

      if (maxWidth && !maxHeight) {
        // Only max width specified
        if (currentWidth > maxWidth) {
          resizeOptions.width = maxWidth;
        }
      } else if (maxHeight && !maxWidth) {
        // Only max height specified
        if (currentHeight > maxHeight) {
          resizeOptions.height = maxHeight;
        }
      } else if (maxWidth && maxHeight) {
        // Both specified - fit within bounds
        if (currentWidth > maxWidth || currentHeight > maxHeight) {
          resizeOptions.width = maxWidth;
          resizeOptions.height = maxHeight;
          resizeOptions.fit = 'inside';
        }
      }
    }

    // Apply resize if needed
    if (Object.keys(resizeOptions).length > 0) {
      pipeline = pipeline.resize(resizeOptions);
    }

    // Convert to WebP
    const webpBuffer = await pipeline
      .webp({ quality: 80 })
      .toBuffer();

    // Get final image info
    const finalMetadata = await sharp(webpBuffer).metadata();

    // Return the converted image
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'image/webp',
        'Content-Disposition': 'inline; filename="converted.webp"',
        'X-Original-Width': metadata.width.toString(),
        'X-Original-Height': metadata.height.toString(),
        'X-Final-Width': finalMetadata.width.toString(),
        'X-Final-Height': finalMetadata.height.toString(),
      },
      body: webpBuffer.toString('base64'),
      isBase64Encoded: true,
    };

  } catch (error) {
    console.error('Error processing image:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to process image',
        message: error.message 
      }),
    };
  }
};

/**
 * Parse multipart/form-data
 */
function parseMultipartFormData(body, boundary, isBase64Encoded) {
  // Decode if base64
  let buffer;
  if (isBase64Encoded) {
    buffer = Buffer.from(body, 'base64');
  } else {
    buffer = Buffer.from(body, 'binary');
  }

  const parts = {};
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const boundaryEnd = Buffer.from(`--${boundary}--`);

  let position = 0;

  while (position < buffer.length) {
    // Find next boundary
    const boundaryIndex = buffer.indexOf(boundaryBuffer, position);
    if (boundaryIndex === -1) break;

    // Skip the boundary
    position = boundaryIndex + boundaryBuffer.length;

    // Skip CRLF after boundary
    if (buffer[position] === 13 && buffer[position + 1] === 10) {
      position += 2;
    }

    // Check if this is the end boundary
    if (buffer.indexOf(boundaryEnd, boundaryIndex) === boundaryIndex) {
      break;
    }

    // Find the end of headers (double CRLF)
    const headersEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), position);
    if (headersEnd === -1) break;

    // Parse headers
    const headersBuffer = buffer.slice(position, headersEnd);
    const headers = headersBuffer.toString('utf-8');
    
    // Extract field name from Content-Disposition
    const nameMatch = headers.match(/name="([^"]+)"/);
    if (!nameMatch) {
      position = headersEnd + 4;
      continue;
    }
    const fieldName = nameMatch[1];

    // Check if this is a file
    const isFile = headers.includes('filename=');

    // Move past headers
    position = headersEnd + 4;

    // Find next boundary
    const nextBoundary = buffer.indexOf(boundaryBuffer, position);
    if (nextBoundary === -1) break;

    // Extract content (excluding trailing CRLF before boundary)
    let content = buffer.slice(position, nextBoundary - 2);

    if (isFile) {
      parts[fieldName] = content;
    } else {
      parts[fieldName] = content.toString('utf-8');
    }

    position = nextBoundary;
  }

  return parts;
}
