// src/components/MainPage.tsx
import React, { useContext, useEffect, useState } from 'react'
import { createFile, deleteFile, downloadFile, listFiles, uploadFile } from '../services/googleApi'
import { AuthContext } from '../context/AuthContext.ts'

const MainPage: React.FC = () => {
	const { isSignedIn, signIn, signOut } = useContext(AuthContext)
	const [files, setFiles] = useState<gapi.client.drive.File[]>([])
	const [loading, setLoading] = useState<boolean>(false)
	const [error, setError] = useState<string | null>(null)
	const [selectedFile, setSelectedFile] = useState<File | null>(null)

	useEffect(() => {
		if (isSignedIn) {
			fetchFiles()
		} else {
			setFiles([])
		}
	}, [isSignedIn])

	const fetchFiles = async () => {
		setLoading(true)
		setError(null)
		try {
			const apiFiles = await listFiles()
			// Optionally filter out files without an ID
			const filesWithId = apiFiles.filter(file => file.id)
			setFiles(filesWithId)
		} catch (error) {
			console.error('Error fetching files:', error)
			setError('Failed to fetch files. Please try again.')
		} finally {
			setLoading(false)
		}
	}

	const handleCreateFile = async () => {
		// Creates a new sample file in Google Drive.
		setError(null)
		try {
			const response = await createFile(`Sample_${new Date().toISOString()}.txt`, 'Hello, Google Drive!')
			console.log('File Created:', response)
			fetchFiles()
		} catch (error) {
			console.error('Error Creating File:', error)
			setError('Failed to create file. Please try again.')
		}
	}

	const handleDownloadFile = async (fileId: string, fileName: string, fileType: string) => {
		// Downloads a file from Drive and triggers the browser download.
		setError(null)
		try {
			await downloadFile(fileId, fileName, fileType)
		} catch (error) {
			console.error('Error downloading file:', error)
			setError('Failed to download file. Please try again.')
		}
	}

	const handleDeleteFile = async (fileId: string, fileName: string) => {
		// Deletes a file from Google Drive after confirmation.
		const shouldDelete = window.confirm(`Delete "${fileName}" from Google Drive?`)
		if (!shouldDelete) {
			return
		}
		setError(null)
		try {
			await deleteFile(fileId)
			fetchFiles()
		} catch (error) {
			console.error('Error deleting file:', error)
			setError('Failed to delete file. Please try again.')
		}
	}

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		// Updates the selected file from the file input.
		const nextFile = event.target.files?.[0] ?? null
		setSelectedFile(nextFile)
	}

	const handleUploadFile = async () => {
		// Uploads the selected file to Google Drive.
		if (!selectedFile) {
			setError('Please select a file to upload.')
			return
		}
		setError(null)
		try {
			await uploadFile(selectedFile)
			setSelectedFile(null)
			fetchFiles()
		} catch (error) {
			console.error('Error uploading file:', error)
			setError('Failed to upload file. Please try again.')
		}
	}

	return (
		<section>
			{isSignedIn ? (
				<section>
					<div className="mb-4">
						<button type="button" className="btn btn-lg bg-success me-3" onClick={handleCreateFile}>
							Create File
						</button>
						<input type="file" className="form-control d-inline-block w-auto me-2" onChange={handleFileChange} />
						<button type="button" className="btn btn-lg bg-primary me-3" onClick={handleUploadFile} disabled={!selectedFile}>
							Upload File
						</button>
						<button type="button" className="btn btn-lg bg-danger" onClick={signOut}>
							Sign Out
						</button>
					</div>
					{error && (
						<div className="alert alert-danger" role="alert">
							{error}
							<button
								type="button"
								className="btn-close"
								onClick={() => setError(null)}
								aria-label="Close"
								style={{ float: 'right' }}></button>
						</div>
					)}
					<div>
						<h5>Your Files</h5>
						{loading ? (
							<div className="alert alert-primary">Loading files...</div>
						) : files.length > 0 ? (
							<ul>
								{files.map(file => {
									// Since we filtered out files without an ID, file.id should exist
									const fileId = file.id!
									const fileName = file.name || 'Unnamed File'
									const fileType = file.mimeType || 'Unknown Type'
									const isGoogleAppsFile = fileType.startsWith('application/vnd.google-apps')

									return (
										<li key={fileId}>
											<span>
												{fileName} ({fileType})
											</span>
											<button
												type="button"
												className="btn btn-sm bg-primary ms-2"
												onClick={() => handleDownloadFile(fileId, fileName, fileType)}
												disabled={isGoogleAppsFile}>
												Download
											</button>
											<button
												type="button"
												className="btn btn-sm bg-danger ms-2"
												onClick={() => handleDeleteFile(fileId, fileName)}>
												Delete
											</button>
											{isGoogleAppsFile && <span className="ms-2 text-muted">Export required</span>}
										</li>
									)
								})}
							</ul>
						) : (
							<div className="alert alert-warning">No files found.</div>
						)}
					</div>
				</section>
			) : (
				<button type="button" className="btn btn-lg bg-success" onClick={signIn}>
					Sign In with Google
				</button>
			)}
		</section>
	)
}

export default MainPage
