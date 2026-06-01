from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models.proveedor import Proveedor
from app.schemas.proveedor import (
    ProveedorCreate,
    ProveedorUpdate,
    ProveedorResponse,
)
from app.schemas.comun import PaginatedResponse
from app.utils.deps import get_usuario_actual, require_operador, require_admin
from app.utils.auditoria import registrar, get_ip
from app.models.usuario import Usuario

router = APIRouter(prefix="/proveedores", tags=["Proveedores"])


@router.get("/", response_model=PaginatedResponse[ProveedorResponse])
def listar_proveedores(
    skip: int = 0,
    limit: int = 50,
    nombre: Optional[str] = None,
    incluir_inactivos: bool = False,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    """Lista proveedores con filtro opcional por nombre.

    Solo el admin puede ver proveedores inactivos.
    """
    q = db.query(Proveedor)
    if not incluir_inactivos:
        q = q.filter(Proveedor.activo.is_(True))
    if nombre:
        q = q.filter(Proveedor.nombre.ilike(f"%{nombre}%"))
    q = q.order_by(Proveedor.nombre)
    total = q.count()
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": q.offset(skip).limit(limit).all(),
    }


@router.get("/{proveedor_id}", response_model=ProveedorResponse)
def obtener_proveedor(
    proveedor_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    prov = db.query(Proveedor).filter(Proveedor.id == proveedor_id).first()
    if not prov:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    return prov


@router.post("/", response_model=ProveedorResponse, status_code=201)
def crear_proveedor(
    request: Request,
    datos: ProveedorCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    if datos.rut:
        existe = db.query(Proveedor).filter(
            Proveedor.rut == datos.rut
        ).first()
        if existe:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ya existe un proveedor con RUT '{datos.rut}'.",
            )
    prov = Proveedor(**datos.model_dump())
    db.add(prov)
    db.commit()
    db.refresh(prov)
    registrar(
        db, "CREAR_PROVEEDOR",
        usuario=usuario, entidad="proveedor", entidad_id=prov.id,
        detalle=prov.nombre, ip=get_ip(request),
    )
    return prov


@router.put("/{proveedor_id}", response_model=ProveedorResponse)
def actualizar_proveedor(
    proveedor_id: int,
    request: Request,
    datos: ProveedorUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    prov = db.query(Proveedor).filter(Proveedor.id == proveedor_id).first()
    if not prov:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    if datos.rut and datos.rut != prov.rut:
        existe = db.query(Proveedor).filter(
            Proveedor.rut == datos.rut,
            Proveedor.id != proveedor_id,
        ).first()
        if existe:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ya existe otro proveedor con RUT '{datos.rut}'.",
            )
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(prov, campo, valor)
    db.commit()
    db.refresh(prov)
    registrar(
        db, "ACTUALIZAR_PROVEEDOR",
        usuario=usuario, entidad="proveedor", entidad_id=prov.id,
        detalle=prov.nombre, ip=get_ip(request),
    )
    return prov


@router.delete("/{proveedor_id}", status_code=204)
def desactivar_proveedor(
    proveedor_id: int,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_admin),
):
    """Soft-delete: desactiva el proveedor sin borrar su historial."""
    prov = db.query(Proveedor).filter(Proveedor.id == proveedor_id).first()
    if not prov:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    prov.activo = False
    db.commit()
    registrar(
        db, "DESACTIVAR_PROVEEDOR",
        usuario=usuario, entidad="proveedor", entidad_id=prov.id,
        detalle=prov.nombre, ip=get_ip(request),
    )
