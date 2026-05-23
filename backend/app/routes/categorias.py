from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.categoria import Categoria
from app.models.usuario import Usuario
from app.schemas.categoria import CategoriaCreate, CategoriaResponse
from app.schemas.comun import PaginatedResponse
from app.utils.deps import get_usuario_actual, require_operador, require_admin

router = APIRouter(prefix="/categorias", tags=["Categorías"])


@router.get("/", response_model=PaginatedResponse[CategoriaResponse])
def listar_categorias(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual)  # visor, operador y admin
):
    total = db.query(Categoria).count()
    categorias = db.query(Categoria).offset(skip).limit(limit).all()
    return {"total": total, "skip": skip, "limit": limit, "data": categorias}


@router.get("/{categoria_id}", response_model=CategoriaResponse)
def obtener_categoria(
    categoria_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual)  # visor, operador y admin
):
    categoria = db.query(Categoria).filter(Categoria.id == categoria_id).first()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return categoria


@router.post("/", response_model=CategoriaResponse)
def crear_categoria(
    categoria: CategoriaCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador)  # operador y admin
):
    existente = db.query(Categoria).filter(Categoria.nombre == categoria.nombre).first()
    if existente:
        raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")
    nueva = Categoria(**categoria.model_dump())
    db.add(nueva)
    db.commit()
    db.refresh(nueva)
    return nueva


@router.put("/{categoria_id}", response_model=CategoriaResponse)
def actualizar_categoria(
    categoria_id: int,
    datos: CategoriaCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador)  # operador y admin
):
    categoria = db.query(Categoria).filter(Categoria.id == categoria_id).first()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(categoria, campo, valor)
    db.commit()
    db.refresh(categoria)
    return categoria


@router.delete("/{categoria_id}")
def eliminar_categoria(
    categoria_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_admin)  # solo admin
):
    categoria = db.query(Categoria).filter(Categoria.id == categoria_id).first()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    db.delete(categoria)
    db.commit()
    return {"mensaje": "Categoría eliminada"}
