/**
 * @file Google Drive API service module
 * @description Provides utility functions to interact with Google Drive API
 * including initializing the GAPI client, listing files, and creating files.
 */

export const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
const SHARED_FOLDER_ID = import.meta.env.VITE_SHARED_FOLDER_ID

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
		const query = SHARED_FOLDER_ID
			? `'${SHARED_FOLDER_ID}' in parents and trashed = false`
			: "trashed = false and (sharedWithMe or 'me' in owners)"
		const response = await gapi.client.drive.files.list({
			pageSize: 10,
			fields: 'nextPageToken, files(id, name, mimeType)',
			q: query,
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
			...(SHARED_FOLDER_ID ? { parents: [SHARED_FOLDER_ID] } : {}),
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

		const createdFile = response.result as gapi.client.drive.File
		if (createdFile.id) {
			await setFilePublic(createdFile.id)
		}
		return createdFile
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
			...(SHARED_FOLDER_ID ? { parents: [SHARED_FOLDER_ID] } : {}),
		}

		const multipartRequestBody =
			`${delimiter}Content-Type: application/json\r\n\r\n` +
			JSON.stringify(metadata) +
			`${delimiter}Content-Type: ${contentType}\r\nContent-Transfer-Encoding: base64\r\n\r\n` +
			base64Data +
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

		const uploadedFile = response.result as gapi.client.drive.File
		if (uploadedFile.id) {
			await setFilePublic(uploadedFile.id)
		}
		return uploadedFile
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
		const isGoogleAppsFile = mimeType.startsWith('application/vnd.google-apps')
		const { downloadMimeType, downloadName } = getDownloadDetails(mimeType, fileName)

		const response = await gapi.client.request({
			path: isGoogleAppsFile ? `/drive/v3/files/${fileId}/export` : `/drive/v3/files/${fileId}`,
			method: 'GET',
			params: isGoogleAppsFile ? { mimeType: downloadMimeType } : { alt: 'media' },
		})

		const fileBlob = new Blob([response.body ?? ''], {
			type: downloadMimeType || 'application/octet-stream',
		})
		const downloadUrl = URL.createObjectURL(fileBlob)
		const link = document.createElement('a')
		link.href = downloadUrl
		link.download = downloadName || 'download'
		document.body.appendChild(link)
		link.click()
		link.remove()
		URL.revokeObjectURL(downloadUrl)
	} catch (error) {
		console.error('Error downloading file:', error)
		throw new Error('Failed to download file from Google Drive.')
	}
}

interface DownloadDetails {
	downloadMimeType: string
	downloadName: string
}

const getDownloadDetails = (mimeType: string, fileName: string): DownloadDetails => {
	// Determines how to download/export Google Docs types.
	if (!mimeType.startsWith('application/vnd.google-apps')) {
		return { downloadMimeType: mimeType || 'application/octet-stream', downloadName: fileName }
	}

	const exportMap: Record<string, { mimeType: string; extension: string }> = {
		'application/vnd.google-apps.document': {
			mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			extension: '.docx',
		},
		'application/vnd.google-apps.spreadsheet': {
			mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			extension: '.xlsx',
		},
		'application/vnd.google-apps.presentation': {
			mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
			extension: '.pptx',
		},
	}

	const exportInfo = exportMap[mimeType]
	if (!exportInfo) {
		throw new Error('Unsupported Google Docs export type.')
	}

	const normalizedName = fileName || 'download'
	const downloadName = normalizedName.endsWith(exportInfo.extension) ? normalizedName : `${normalizedName}${exportInfo.extension}`
	return { downloadMimeType: exportInfo.mimeType, downloadName }
}

/**
 * Deletes a file from Google Drive by file ID.
 * @async
 * @function deleteFile
 * @param {string} fileId - The ID of the file to delete
 * @returns {Promise<void>}
 * @throws {Error} When file deletion fails
 */
export const deleteFile = async (fileId: string): Promise<void> => {
	try {
		await gapi.client.drive.files.delete({ fileId })
	} catch (error) {
		console.error('Error deleting file:', error)
		throw new Error('Failed to delete file from Google Drive.')
	}
}

const ALLOWED_EDIT_DOMAINS = ['studiographene.com']
const ALLOWED_EDIT_EMAILS = (import.meta.env.VITE_ALLOWED_EDIT_EMAILS ?? '')
	.split(',')
	.map((email: string) => email.trim())
	.filter(Boolean)

/**
 * Makes a file editable for specific domains and users.
 * @async
 * @function setFilePublic
 * @param {string} fileId - The ID of the file to share
 * @returns {Promise<void>}
 */
const setFilePublic = async (fileId: string): Promise<void> => {
	try {
		const permissionRequests = [
			...ALLOWED_EDIT_DOMAINS.map(domain =>
				gapi.client.drive.permissions.create({
					fileId,
					resource: {
						type: 'domain',
						role: 'writer',
						domain,
					},
				})
			),
			...ALLOWED_EDIT_EMAILS.map((emailAddress: string) =>
				gapi.client.drive.permissions.create({
					fileId,
					resource: {
						type: 'user',
						role: 'writer',
						emailAddress,
					},
				})
			),
		]

		if (permissionRequests.length === 0) {
			throw new Error('No sharing targets configured.')
		}

		await Promise.all(permissionRequests)
	} catch (error) {
		console.error('Error setting file permissions:', error)
		throw new Error('Failed to share file with other users.')
	}
}