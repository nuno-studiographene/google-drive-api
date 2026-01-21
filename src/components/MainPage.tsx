// src/components/MainPage.tsx
import React, { useContext, useEffect, useRef, useState } from 'react'
import { deleteFile, downloadFile, listFiles, uploadFile } from '../services/googleApi'
import { AuthContext } from '../context/AuthContext.ts'

const MainPage: React.FC = () => {
	const { isSignedIn, signIn, signOut } = useContext(AuthContext)
	const [files, setFiles] = useState<gapi.client.drive.File[]>([])
	const [loading, setLoading] = useState<boolean>(false)
	const [error, setError] = useState<string | null>(null)
	const [selectedFiles, setSelectedFiles] = useState<File[]>([])
	const fileInputRef = useRef<HTMLInputElement | null>(null)

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
		// Updates the selected files from the file input.
		const nextFiles = event.target.files ? Array.from(event.target.files) : []
		setSelectedFiles(nextFiles)
	}

	const handleUploadFile = async () => {
		// Uploads the selected files to Google Drive.
		if (selectedFiles.length === 0) {
			setError('Please select one or more files to upload.')
			return
		}
		setError(null)
		try {
			await Promise.all(selectedFiles.map(file => uploadFile(file)))
			setSelectedFiles([])
			if (fileInputRef.current) {
				fileInputRef.current.value = ''
			}
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
					<button type="button" className="btn btn-lg bg-danger" onClick={signOut}>
						Sign Out
					</button>
					<br></br>
					<br></br>
					<div className="mb-4">
						{/* <button type="button" className="btn btn-lg bg-success me-3" onClick={handleCreateFile}>
							Create File
						</button> */}
						<input
							ref={fileInputRef}
							type="file"
							multiple
							className="form-control d-inline-block w-auto me-2"
							onChange={handleFileChange}
						/>
						<button type="button" className="btn btn-lg bg-primary me-3" onClick={handleUploadFile} disabled={selectedFiles.length === 0}>
							Submit
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
										<li key={fileId} className="mb-2">
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
