export const downloadTextFile = (
  content: string,
  fileName: string,
  mimeType = 'text/plain;charset=utf-8',
): void => {
  const blob = new Blob([`\uFEFF${content}`], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
