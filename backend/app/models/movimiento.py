from sqlalchemy import Column, Integer, String, Enum, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class TipoMovimiento(str, enum.Enum):
    entrada = "entrada"
    salida = "salida"
    interno = "interno"


class SubtipoMovimiento(str, enum.Enum):
    # --- Entradas ---
    # Ingreso de insumos/implementos nuevos adquiridos a un proveedor
    compra = "compra"
    # Reingreso de un item devuelto por el proveedor tras reparacion
    devolucion_proveedor_entrada = "devolucion_proveedor_entrada"
    # Corrección manual de stock tras conteo físico (sobrante)
    ajuste_entrada = "ajuste_entrada"

    # --- Salidas ---
    # Despacho de material desechable para un taller (no vuelve)
    consumo_taller = "consumo_taller"
    # Salida temporal de un implemento reutilizable hacia una sala
    prestamo_implemento = "prestamo_implemento"
    # Devolución de un item defectuoso/vencido al proveedor
    devolucion_proveedor_salida = "devolucion_proveedor_salida"
    # Baja definitiva: roto, vida útil cumplida o vencido
    baja = "baja"
    # Corrección manual de stock tras conteo físico (faltante)
    ajuste_salida = "ajuste_salida"

    # --- Internos (no mueven stock, cambian estado del item) ---
    # Implemento/activo enviado a mantenimiento externo o interno
    enviado_mantenimiento = "enviado_mantenimiento"
    # Implemento/activo de vuelta a disponible tras mantenimiento
    reingreso_disponible = "reingreso_disponible"
    # Retorno de implemento desde sala de vuelta a bodega
    devolucion_interna = "devolucion_interna"


class Movimiento(Base):
    __tablename__ = "movimientos"

    id = Column(Integer, primary_key=True, index=True)
    tipo = Column(Enum(TipoMovimiento), nullable=False)
    subtipo = Column(Enum(SubtipoMovimiento), nullable=False)
    cantidad = Column(Integer, nullable=False)
    motivo = Column(String, nullable=True)
    fecha = Column(DateTime(timezone=True), server_default=func.now())

    insumo_id = Column(Integer, ForeignKey("insumos.id"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)

    # Contexto opcional: taller que originó el movimiento
    paquete_id = Column(
        Integer, ForeignKey("paquetes_insumo.id"), nullable=True
    )
    # Sala destino/origen del movimiento (ej: sala donde va el insumo)
    sala_id = Column(
        Integer, ForeignKey("salas.id"), nullable=True
    )

    insumo = relationship("Insumo", back_populates="movimientos")
    usuario = relationship("Usuario", backref="movimientos")
    paquete = relationship("PaqueteInsumo", backref="movimientos")
    sala = relationship("Sala", backref="movimientos")
