"""
Fecha y hora local de Hestia (America/Santiago).

El contenedor de la API corre en UTC. Todo calculo de "hoy" o de hora de
pared (HH:MM) debe pasar por estas funciones; de lo contrario, desde las
21:00 de Santiago (20:00 en horario de verano) "hoy" seria el dia siguiente.

Los timestamps (timestamptz) siguen guardandose como instantes absolutos
con datetime.now(timezone.utc); esto solo afecta a fechas de calendario.
"""
from datetime import date, datetime
from zoneinfo import ZoneInfo

ZONA_SANTIAGO = ZoneInfo("America/Santiago")


def ahora_santiago() -> datetime:
    return datetime.now(ZONA_SANTIAGO)


def hoy_santiago() -> date:
    return ahora_santiago().date()
