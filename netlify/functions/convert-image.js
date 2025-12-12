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
    
    let imageBuffer;
    let maxWidth = null;
    let maxHeight = null;
    let format = 'webp';
    // Auto-detect format from host
    const host = (event.headers['x-forwarded-host'] || event.headers['host'] || '').toLowerCase();
    if (!format) format = 'webp';
    if (host.startsWith('avif.') || host.includes('://avif.')) format = 'avif';
    else if (host.startsWith('webp.') || host.includes('://webp.')) format = 'webp';
    else format = 'avif'; // default to avif for other hosts

    // Support multiple input formats: multipart/form-data, application/json, or JSON with URL/base64
    if (contentType.includes('application/json')) {
      // Parse JSON body
      const body = JSON.parse(event.body);
      
      if (body.imageUrl) {
        // Fetch image from URL
        const fetch = require('node-fetch');
        const response = await fetch(body.imageUrl);
        if (!response.ok) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch image from URL' }),
          };
        }
        imageBuffer = Buffer.from(await response.arrayBuffer());
      } else if (body.imageBase64) {
        // Decode base64 image
        const base64Data = body.imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
        imageBuffer = Buffer.from(base64Data, 'base64');
      } else if (body.image) {
        // Support 'image' field for base64 as well
        const base64Data = body.image.replace(/^data:image\/[a-z]+;base64,/, '');
        imageBuffer = Buffer.from(base64Data, 'base64');
      } else {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            error: 'No image provided',
            usage: 'Include imageUrl, imageBase64, or image field in JSON body'
          }),
        };
      }

      maxWidth = body.maxWidth ? parseInt(body.maxWidth, 10) : null;
      maxHeight = body.maxHeight ? parseInt(body.maxHeight, 10) : null;
      if (body.format && typeof body.format === 'string') {
        const f = body.format.toLowerCase();
        if (f === 'avif' || f === 'webp') format = f;
      }

    } else if (contentType.includes('multipart/form-data')) {
      // Parse multipart form data (existing logic)
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

      imageBuffer = parts.image;
      maxWidth = parts.maxWidth ? parseInt(parts.maxWidth, 10) : null;
      maxHeight = parts.maxHeight ? parseInt(parts.maxHeight, 10) : null;
      if (parts.format) {
        const f = String(parts.format).toLowerCase();
        if (f === 'avif' || f === 'webp') format = f;
      }

    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Content-Type must be multipart/form-data or application/json',
          usage: 'Send image file, imageUrl, or imageBase64 with optional maxWidth or maxHeight parameters'
        }),
      };
    }

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
    let pipeline = sharp(imageBuffer);

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

    // Output format selection: default webp, optional avif
    const outputFormat = format;
    const formatParam = outputFormat;

    let outBuffer;
    let finalMetadata;
    const selectedFormat = formatParam || 'webp';

    if (selectedFormat === 'avif') {
      outBuffer = await pipeline.avif({ quality: 60 }).toBuffer();
      finalMetadata = await sharp(outBuffer).metadata();
    } else {
      outBuffer = await pipeline.webp({ quality: 80 }).toBuffer();
      finalMetadata = await sharp(outBuffer).metadata();
    }

    // finalMetadata already computed from outBuffer

    // Return the converted image
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': selectedFormat === 'avif' ? 'image/avif' : 'image/webp',
        'Content-Disposition': selectedFormat === 'avif' ? 'inline; filename="converted.avif"' : 'inline; filename="converted.webp"',
        'X-Original-Width': metadata.width.toString(),
        'X-Original-Height': metadata.height.toString(),
        'X-Final-Width': finalMetadata.width.toString(),
        'X-Final-Height': finalMetadata.height.toString(),
        'X-Output-Format': selectedFormat,
      },
      body: outBuffer.toString('base64'),
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
