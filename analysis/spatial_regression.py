#!/usr/bin/env python3
"""H1 空间回归：树冠是否在控制空间依赖后仍与热异常负相关。
流程：OLS(+Moran's I/LM 诊断) -> 空间误差模型(SEM) -> 空间滞后模型(SLM)。
输入：csv_file/gridS_*.csv  输出：终端摘要 + spatial_regression_results.txt
"""
import glob, sys, warnings
import numpy as np, pandas as pd
import libpysal
from libpysal.weights import KNN
import spreg
warnings.filterwarnings("ignore")

CSV_DIR = "data"
OUT = "spatial_regression_results.txt"
Y = "lst_anom"
XVARS = ["tree", "built", "water", "elev", "slope", "road_dens"]
K = 8  # KNN 邻居数

def load():
    dfs = [pd.read_csv(f) for f in sorted(glob.glob(f"{CSV_DIR}/gridS_*.csv"))]
    df = pd.concat(dfs, ignore_index=True)
    keep = XVARS + [Y, "lon", "lat", "city", "pop"]
    df = df[keep].copy()
    numcols = XVARS + [Y, "lon", "lat", "pop"]
    df[numcols] = df[numcols].apply(pd.to_numeric, errors="coerce")
    df = df.dropna(subset=XVARS + [Y, "lon", "lat"])
    # 城市固定效应（哑变量，drop 第一个）
    dummies = pd.get_dummies(df["city"], prefix="city", drop_first=True).astype(float)
    df = pd.concat([df.reset_index(drop=True), dummies.reset_index(drop=True)], axis=1)
    return df, list(dummies.columns)

def main():
    df, citycols = load()
    n = len(df)
    print(f"样本数: {n}  | 城市: {df['city'].unique().tolist()}")
    xcols = XVARS + citycols
    y = df[[Y]].values
    X = df[xcols].values

    # 空间权重（KNN, 行标准化）—— 城市间距离远，KNN 不会跨城连接
    coords = df[["lon", "lat"]].values
    w = KNN.from_array(coords, k=K)
    w.transform = "r"

    lines = []
    def log(s=""):
        print(s); lines.append(str(s))

    # ---- 1. OLS + 空间诊断 ----
    ols = spreg.OLS(y, X, w=w, spat_diag=True, moran=True,
                    name_y=Y, name_x=xcols, name_w=f"KNN{K}", name_ds="YRD")
    log("="*70); log("OLS（含 Moran's I / LM 空间诊断）"); log("="*70)
    log(ols.summary)

    # ---- 2. 空间误差模型 SEM（异方差稳健 GMM）----
    sem = spreg.GM_Error_Het(y, X, w=w, name_y=Y, name_x=xcols, name_w=f"KNN{K}", name_ds="YRD")
    log("\n" + "="*70); log("空间误差模型 SEM (GM_Error_Het)"); log("="*70)
    log(sem.summary)

    # ---- 3. 空间滞后模型 SLM ----
    lag = spreg.GM_Lag(y, X, w=w, spat_diag=True,
                       name_y=Y, name_x=xcols, name_w=f"KNN{K}", name_ds="YRD")
    log("\n" + "="*70); log("空间滞后模型 SLM (GM_Lag)"); log("="*70)
    log(lag.summary)

    # ---- 3b. SARAR 组合模型(空间滞后+误差, GMM, 异方差稳健) ----
    try:
        combo = spreg.GM_Combo_Het(y, X, w=w, name_y=Y, name_x=xcols, name_w=f"KNN{K}", name_ds="YRD")
        log("\n" + "="*70); log("SARAR 组合模型 (GM_Combo_Het: lag + error)"); log("="*70)
        log(combo.summary)
    except Exception as e:
        combo = None; log(f"SARAR 失败: {e}")

    # ---- 4. tree 系数三模型对比 ----
    def beta_tree(m):
        b = np.asarray(m.betas).flatten()
        # betas 顺序：CONSTANT, 然后 name_x 顺序
        names = ["CONSTANT"] + xcols
        if hasattr(m, "name_x") and m.name_x and m.name_x[0] != "CONSTANT":
            names = ["CONSTANT"] + list(m.name_x)
        idx = names.index("tree") if "tree" in names else 1
        return b[idx]
    log("\n" + "="*70); log("tree 系数对比（期望显著为负）"); log("="*70)
    log(f"OLS   tree β = {beta_tree(ols):.4f}")
    log(f"SEM   tree β = {beta_tree(sem):.4f}")
    log(f"SLM   tree β = {beta_tree(lag):.4f}")
    if combo is not None:
        try: log(f"SARAR tree β = {beta_tree(combo):.4f}")
        except Exception as e: log(f"SARAR tree β 提取失败: {e}")
    log(f"\nOLS Moran's I (残差) = {ols.moran_res[0]:.4f}, p = {ols.moran_res[2]:.3g}")
    log(f"OLS R² = {ols.r2:.4f} | SLM pseudo-R² = {getattr(lag,'pr2',float('nan')):.4f}")

    with open(OUT, "w") as f:
        f.write("\n".join(lines))
    print(f"\n结果已保存到 {OUT}")

if __name__ == "__main__":
    main()
