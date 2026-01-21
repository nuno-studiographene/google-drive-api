/**
 * @file Google Drive API service module
 * @description Provides utility functions to interact with Google Drive API
 * including initializing the GAPI client, listing files, and creating files.
 */

export const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']

/**
 * Initializes the Google API client
 * @async
 * @function initGapiClient
 * @returns {Promise<void>}
 */
export const initGapiClient = async () => {
	await gapi.client.init({
		apiKey: API_KEY,
		discoveryDocs: DISCOVERY_DOCS,
	})
}

// IMPORTANT: Before making calls, ensure GAPI has the latest token from GIS
// gapi.client.setToken({ access_token: getAccessToken() });

/**
 * Lists files from Google Drive
 * @async
 * @function listFiles
 * @returns {Promise<gapi.client.drive.File[]>} Array of files from Google Drive
 * @throws {Error} When file retrieval fails
 */
export const listFiles = async (): Promise<gapi.client.drive.File[]> => {
	try {
		const response = await gapi.client.drive.files.list({
			pageSize: 10,
			fields: 'nextPageToken, files(id, name, mimeType)',
		})
		return response.result.files || []
	} catch (error) {
		console.error('Error listing files:', error)
		throw new Error('Failed to retrieve files from Google Drive.')
	}
}

/**
 * Creates a new file in Google Drive
 * @async
 * @function createFile
 * @param {string} name - The name of the file to create
 * @param {string} content - The content of the file
 * @returns {Promise<any>} The created file object from Google Drive API response
 * @throws {Error} When file creation fails
 */
export const createFile = async (name: string, content: string) => {
	try {
		const boundary = 'foo_bar_baz'
		const delimiter = `\r\n--${boundary}\r\n`
		const close_delim = `\r\n--${boundary}--`

		const contentType = 'text/plain'
		const metadata = {
			name: name,
			mimeType: contentType,
		}

		const multipartRequestBody =
			`${delimiter}Content-Type: application/json\r\n\r\n` +
			JSON.stringify(metadata) +
			`${delimiter}Content-Type: ${contentType}\r\n\r\n` +
			content +
			close_delim

		const response = await gapi.client.request({
			path: '/upload/drive/v3/files',
			method: 'POST',
			params: { uploadType: 'multipart' },
			headers: {
				'Content-Type': `multipart/related; boundary="${boundary}"`,
			},
			body: multipartRequestBody,
		})

		return response.result
	} catch (error) {
		console.error('Error creating file:', error)
		throw new Error('Failed to create file in Google Drive.')
	}
}

/**
 * Reads a file as a base64 string for upload.
 * @function readFileAsBase64
 * @param {File} file - The file to read
 * @returns {Promise<string>} Base64-encoded file contents
 */
const readFileAsBase64 = (file: File): Promise<string> => {
	// Reads a local file and returns its base64 contents.
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => {
			if (typeof reader.result === 'string') {
				const base64Data = reader.result.split(',')[1] || ''
				resolve(base64Data)
				return
			}
			reject(new Error('Failed to read file as base64.'))
		}
		reader.onerror = () => reject(new Error('Failed to read file.'))
		reader.readAsDataURL(file)
	})
}

/**
 * Uploads a file to Google Drive.
 * @async
 * @function uploadFile
 * @param {File} file - The file to upload
 * @returns {Promise<gapi.client.drive.File>} The uploaded file metadata
 * @throws {Error} When file upload fails
 */
export const uploadFile = async (file: File): Promise<gapi.client.drive.File> => {
	// Uploads a local file to Google Drive.
	try {
		const boundary = 'foo_bar_baz'
		const delimiter = `\r\n--${boundary}\r\n`
		const close_delim = `\r\n--${boundary}--`
		const contentType = file.type || 'application/octet-stream'
		const base64Data = await readFileAsBase64(file)

		const metadata = {
			name: file.name,
			mimeType: contentType,
		}

		const multipartRequestBody =
			`${delimiter}Content-Type: application/json\r\n\r\n` +
			JSON.stringify(metadata) +
			`${delimiter}Content-Type: ${contentType}\r\nContent-Transfer-Encoding: base64\r\n\r\n` +
			base64Data +
			close_delim

		const response = await gapi.client.request<gapi.client.drive.File>({
			path: '/upload/drive/v3/files',
			method: 'POST',
			params: { uploadType: 'multipart' },
			headers: {
				'Content-Type': `multipart/related; boundary="${boundary}"`,
			},
			body: multipartRequestBody,
		})

		return response.result
	} catch (error) {
		console.error('Error uploading file:', error)
		throw new Error('Failed to upload file to Google Drive.')
	}
}

/**
 * Downloads a file from Google Drive by file ID.
 * @async
 * @function downloadFile
 * @param {string} fileId - The ID of the file to download
 * @param {string} fileName - The name of the file to save as
 * @param {string} mimeType - The MIME type of the file
 * @returns {Promise<void>}
 * @throws {Error} When file download fails or file type is not downloadable
 */
export const downloadFile = async (fileId: string, fileName: string, mimeType: string): Promise<void> => {
	try {
		if (mimeType.startsWith('application/vnd.google-apps')) {
			throw new Error('Google Docs files must be exported before download.')
		}

		const response = await gapi.client.request<unknown>({
			path: `/drive/v3/files/${fileId}`,
			method: 'GET',
			params: { alt: 'media' },
		})

		const fileBlob = new Blob([response.body ?? ''], {
			type: mimeType || 'application/octet-stream',
		})
		const downloadUrl = URL.createObjectURL(fileBlob)
		const link = document.createElement('a')
		link.href = downloadUrl
		link.download = fileName || 'download'
		document.body.appendChild(link)
		link.click()
		link.remove()
		URL.revokeObjectURL(downloadUrl)
	} catch (error) {
		console.error('Error downloading file:', error)
		throw new Error('Failed to download file from Google Drive.')
	}
}