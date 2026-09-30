import api from '@/lib/api'
import { hojeISODate } from '@/lib/utils'

export async function baixarPlanilha(endpoint: string, nome: string, params?: Record<string, unknown>) {
  const res = await api.get(endpoint, { params, responseType: 'blob' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(
    new Blob([res.data as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
  a.download = `${nome}-${hojeISODate()}.xlsx`
  a.click()
  URL.revokeObjectURL(a.href)
}
