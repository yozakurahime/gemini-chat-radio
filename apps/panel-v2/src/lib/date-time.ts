export const BR_TIMEZONE = "America/Sao_Paulo"

function toDate(value?: number | string) {
  if (value === undefined || value === null || value === "") return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function capitalizeLabel(value: string) {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function formatDateTimeBr(value?: number | string, fallback = "-") {
  const date = toDate(value)
  if (!date) return fallback
  try {
    return date.toLocaleString("pt-BR", { timeZone: BR_TIMEZONE })
  } catch {
    return fallback
  }
}

export function formatDateBr(value?: number | string, fallback = "-") {
  const date = toDate(value)
  if (!date) return fallback
  try {
    return date.toLocaleDateString("pt-BR", { timeZone: BR_TIMEZONE })
  } catch {
    return fallback
  }
}

export function formatTimeBr(value?: number | string, fallback = "") {
  const date = toDate(value)
  if (!date) return fallback
  try {
    return date.toLocaleTimeString("pt-BR", {
      timeZone: BR_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return fallback
  }
}

export function formatTimeWithSecondsBr(value?: number | string, fallback = "") {
  const date = toDate(value)
  if (!date) return fallback
  try {
    return date.toLocaleTimeString("pt-BR", {
      timeZone: BR_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  } catch {
    return fallback
  }
}

export function formatWeekdayBr(value?: number | string, fallback = "") {
  const date = toDate(value)
  if (!date) return fallback
  try {
    return capitalizeLabel(date.toLocaleDateString("pt-BR", {
      timeZone: BR_TIMEZONE,
      weekday: "long",
    }))
  } catch {
    return fallback
  }
}

export function formatDateFullBr(value?: number | string, fallback = "-") {
  const date = toDate(value)
  if (!date) return fallback
  try {
    return capitalizeLabel(date.toLocaleDateString("pt-BR", {
      timeZone: BR_TIMEZONE,
      day: "2-digit",
      month: "long",
      year: "numeric",
    }))
  } catch {
    return fallback
  }
}
