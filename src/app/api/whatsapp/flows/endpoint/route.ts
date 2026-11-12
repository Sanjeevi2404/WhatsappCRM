import { NextResponse } from 'next/server'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

function getPrivateKey(): string {
  if (process.env.WHATSAPP_FLOW_PRIVATE_KEY) {
    let key = process.env.WHATSAPP_FLOW_PRIVATE_KEY.trim()
    if (key.startsWith('"') && key.endsWith('"')) {
      key = key.slice(1, -1)
    }
    if (key.includes('\\n')) {
      key = key.replace(/\\n/g, '\n')
    }
    return key
  }
  const possiblePaths = [
    'e:/MDA/private.key',
    'E:/MDA/private.key',
    path.join(process.cwd(), 'private.key'),
    path.join(process.cwd(), '..', 'private.key'),
  ]
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8')
    }
  }
  throw new Error('WhatsApp Flow private key not found.')
}

export async function GET() {
  return NextResponse.json({
    status: 'active',
    endpoint: 'whatsapp_flows_endpoint',
  })
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || !body.encrypted_flow_data || !body.encrypted_aes_key || !body.initial_vector) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const privateKey = getPrivateKey()
    const { encrypted_flow_data, encrypted_aes_key, initial_vector } = body

    // 1. Decrypt AES Key using RSA Private Key with OAEP SHA-256
    const decryptedAesKey = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(encrypted_aes_key, 'base64')
    )

    // 2. Decrypt Flow Data using AES-128-GCM
    const iv = Buffer.from(initial_vector, 'base64')
    const rawEncryptedFlowData = Buffer.from(encrypted_flow_data, 'base64')
    const authTag = rawEncryptedFlowData.subarray(rawEncryptedFlowData.length - 16)
    const ciphertext = rawEncryptedFlowData.subarray(0, rawEncryptedFlowData.length - 16)

    const decipher = crypto.createDecipheriv('aes-128-gcm', decryptedAesKey, iv)
    decipher.setAuthTag(authTag)
    let decryptedText = decipher.update(ciphertext, undefined, 'utf8')
    decryptedText += decipher.final('utf8')

    const decryptedData = JSON.parse(decryptedText)
    console.log('[WhatsApp Flow Endpoint] Decrypted Action:', decryptedData.action)

    let responseData: Record<string, unknown> = {}

    if (decryptedData.action === 'ping') {
      responseData = {
        version: decryptedData.version || '3.0',
        data: {
          status: 'active',
        },
      }
    } else {
      // General data_exchange fallback
      responseData = {
        version: decryptedData.version || '3.0',
        screen: 'SUCCESS',
        data: {
          extension_message_response: {
            params: {
              flow_token: decryptedData.flow_token,
              ...(decryptedData.data || {}),
            },
          },
        },
      }
    }

    // 3. Encrypt Response with inverted IV
    const responseJson = JSON.stringify(responseData)
    const flippedIv = Buffer.from(iv.map((b) => b ^ 0xff))
    const cipher = crypto.createCipheriv('aes-128-gcm', decryptedAesKey, flippedIv)
    let resEncrypted = cipher.update(responseJson, 'utf8')
    resEncrypted = Buffer.concat([resEncrypted, cipher.final(), cipher.getAuthTag()])

    return new Response(resEncrypted.toString('base64'), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    })
  } catch (err) {
    console.error('[WhatsApp Flow Endpoint] Error handling request:', err)
    return NextResponse.json(
      {
        error: 'Flow endpoint decryption/processing error',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
