import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from geom import box_faces, eval_expr, resolve_params, to_freecad_expr


def test_expr_add_mul():
    assert abs(eval_expr("inner_l + 2 * wall", {"inner_l": 100, "wall": 2.4}) - 104.8) < 1e-9


def test_freecad_rewrite():
    assert to_freecad_expr("inner_l + 2 * wall", {"inner_l", "wall"}) == "Params.inner_l + 2 * Params.wall"


def test_param_order():
    p = resolve_params(
        [
            {"name": "a", "value": 10},
            {"name": "b", "value": 0, "expression": "a * 2 + 1"},
        ]
    )
    assert p["b"] == 21


def test_faces():
    faces = {f["name"]: f for f in box_faces({"x": 0, "y": 0, "z": 0}, 80, 50, 12)}
    assert faces["top_face"]["origin"]["z"] == 12
    assert faces["right_face"]["origin"]["x"] == 80
    assert faces["front_face"]["width"] == 80
