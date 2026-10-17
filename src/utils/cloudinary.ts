const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined

export async function uploadImageToCloudinary(file: File, folder?: string): Promise<string> {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error('Cloudinary is not configured. Please set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.')
  }

  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)
  if (folder) formData.append('folder', folder)

  let response: Response
  try {
    response = await fetch(uploadUrl, { method: 'POST', body: formData })
  } catch {
    throw new Error('Could not reach Cloudinary. Please check your internet connection and try again.')
  }

  if (!response.ok) {
    let message = `Cloudinary upload failed (HTTP ${response.status}).`
    try {
      const errorBody = (await response.json()) as { error?: { message?: string } }
      if (errorBody?.error?.message) {
        message = `Cloudinary upload failed: ${errorBody.error.message}`
      }
    } catch {
      // response body wasn't JSON; keep the generic message
    }
    throw new Error(message)
  }

  const data = (await response.json()) as { secure_url?: string }
  if (!data.secure_url) {
    throw new Error('Cloudinary upload succeeded but did not return an image URL.')
  }

  return data.secure_url
}
