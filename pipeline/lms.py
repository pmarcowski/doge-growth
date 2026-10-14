"""Penalised-likelihood LMS (Box-Cox Cole-Green) centile fitting with P-splines.

The model (Cole & Green 1992; Rigby & Stasinopoulos 2005, distribution BCCG):

    z = ((y / mu)^nu - 1) / (nu * sigma)      (nu != 0),   z = log(y / mu) / sigma  (nu = 0)
    z ~ N(0, 1)  (truncated below at -1/(sigma|nu|), as in the BCCG density)

log mu(x), log sigma(x) and nu(x) are B-splines in the transformed age x with second-order
difference penalties (Eilers & Marx P-splines). Smoothing parameters are chosen by GAIC with
a user-supplied penalty per effective degree of freedom (k = log(n) reproduces SBC/BIC).
Only numpy and scipy are needed.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.interpolate import BSpline
from scipy.optimize import minimize
from scipy.special import log_ndtr
from scipy.stats import norm

SQRT2PI = np.sqrt(2.0 * np.pi)


def bspline_basis(x: np.ndarray, lo: float, hi: float, nseg: int, degree: int = 3) -> tuple[np.ndarray, np.ndarray]:
    """Equally spaced B-spline basis on [lo, hi] with `nseg` segments. Returns (basis, knots)."""
    dx = (hi - lo) / nseg
    knots = np.linspace(lo - degree * dx, hi + degree * dx, nseg + 2 * degree + 1)
    xc = np.clip(x, lo, hi)
    B = BSpline.design_matrix(xc, knots, degree).toarray()
    return B, knots


def diff_penalty(nb: int, order: int = 2) -> np.ndarray:
    D = np.eye(nb)
    for _ in range(order):
        D = np.diff(D, axis=0)
    return D.T @ D


@dataclass
class LMSSpec:
    xlo: float
    xhi: float
    nseg_mu: int = 16
    nseg_sigma: int = 8
    nseg_nu: int = 3
    degree: int = 3


@dataclass
class LMSFit:
    spec: LMSSpec
    knots_mu: np.ndarray
    knots_sigma: np.ndarray
    knots_nu: np.ndarray
    beta_mu: np.ndarray
    beta_sigma: np.ndarray
    beta_nu: np.ndarray
    lambdas: tuple[float, float, float]
    loglik: float
    edf: tuple[float, float, float]
    gaic: float
    n: int
    extra: dict = field(default_factory=dict)

    # --- evaluation -------------------------------------------------------------------
    def params(self, x: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        x = np.asarray(x, dtype=float)
        d = self.spec.degree
        xc = np.clip(x, self.spec.xlo, self.spec.xhi)
        Bm = BSpline.design_matrix(xc, self.knots_mu, d).toarray()
        Bs = BSpline.design_matrix(xc, self.knots_sigma, d).toarray()
        Bn = BSpline.design_matrix(xc, self.knots_nu, d).toarray()
        return np.exp(Bm @ self.beta_mu), np.exp(Bs @ self.beta_sigma), Bn @ self.beta_nu

    def zscore(self, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        mu, sigma, nu = self.params(x)
        return bccg_z(np.asarray(y, float), mu, sigma, nu)

    def centile(self, x: np.ndarray, z: float | np.ndarray) -> np.ndarray:
        mu, sigma, nu = self.params(x)
        return bccg_quantile(z, mu, sigma, nu)


def bccg_z(y: np.ndarray, mu: np.ndarray, sigma: np.ndarray, nu: np.ndarray) -> np.ndarray:
    u = y / mu
    small = np.abs(nu) < 1e-6
    nu_s = np.where(small, 1.0, nu)
    z = np.where(small, np.log(u) / sigma, (np.power(u, nu_s) - 1.0) / (nu_s * sigma))
    return z


def bccg_quantile(z: float | np.ndarray, mu: np.ndarray, sigma: np.ndarray, nu: np.ndarray) -> np.ndarray:
    small = np.abs(nu) < 1e-6
    nu_s = np.where(small, 1.0, nu)
    inner = 1.0 + nu_s * sigma * z
    inner = np.maximum(inner, 1e-9)
    return np.where(small, mu * np.exp(sigma * z), mu * np.power(inner, 1.0 / nu_s))


def _negpenloglik(theta, y, logy, Bm, Bs, Bn, Pm, Ps, Pn, lam, grad_out):
    km, ks = Bm.shape[1], Bs.shape[1]
    bm, bs, bn = theta[:km], theta[km:km + ks], theta[km + ks:]
    logmu = Bm @ bm
    logsig = Bs @ bs
    nu = Bn @ bn
    mu = np.exp(logmu)
    sigma = np.exp(logsig)
    logu = logy - logmu
    small = np.abs(nu) < 1e-6
    nu_s = np.where(small, 1.0, nu)
    unu = np.exp(nu_s * logu)
    z = np.where(small, logu / sigma, (unu - 1.0) / (nu_s * sigma))
    a = 1.0 / (sigma * np.maximum(np.abs(nu), 1e-6))
    logPhi = log_ndtr(a)
    ll = (nu - 1.0) * logy - nu * logmu - logsig - 0.5 * z * z - logPhi - np.log(SQRT2PI)
    pen = lam[0] * bm @ Pm @ bm + lam[1] * bs @ Ps @ bs + lam[2] * bn @ Pn @ bn
    f = -ll.sum() + pen
    if grad_out is not None:
        # hazard-like ratio phi(a)/Phi(a)
        r = np.exp(norm.logpdf(a) - logPhi)
        dl_dmu = (-nu + z * unu / sigma) / mu                 # d ll / d mu
        dl_dlogmu = dl_dmu * mu
        dl_dsigma = (-1.0 + z * z) / sigma + r * a / sigma
        dl_dlogsig = dl_dsigma * sigma
        dz_dnu = np.where(small, 0.5 * logu * logu / sigma, (unu * logu) / (nu_s * sigma) - z / nu_s)
        dl_dnu = logu - z * dz_dnu + np.where(small, 0.0, r * a / nu_s)
        g = np.concatenate([
            -(Bm.T @ dl_dlogmu) + 2.0 * lam[0] * (Pm @ bm),
            -(Bs.T @ dl_dlogsig) + 2.0 * lam[1] * (Ps @ bs),
            -(Bn.T @ dl_dnu) + 2.0 * lam[2] * (Pn @ bn),
        ])
        grad_out[:] = g
    return f


def fit_lms(x: np.ndarray, y: np.ndarray, spec: LMSSpec, lambdas: tuple[float, float, float],
            theta0: np.ndarray | None = None, gaic_k: float | None = None) -> LMSFit:
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    n = len(y)
    logy = np.log(y)
    Bm, km_ = bspline_basis(x, spec.xlo, spec.xhi, spec.nseg_mu, spec.degree)
    Bs, ks_ = bspline_basis(x, spec.xlo, spec.xhi, spec.nseg_sigma, spec.degree)
    Bn, kn_ = bspline_basis(x, spec.xlo, spec.xhi, spec.nseg_nu, spec.degree)
    Pm, Ps, Pn = diff_penalty(Bm.shape[1]), diff_penalty(Bs.shape[1]), diff_penalty(Bn.shape[1])
    km, ks, kn = Bm.shape[1], Bs.shape[1], Bn.shape[1]
    if theta0 is None:
        # start: log-normal with the bin medians as mu, constant sigma 0.2, nu = 1
        theta0 = np.concatenate([np.full(km, np.median(logy)), np.full(ks, np.log(0.2)), np.full(kn, 1.0)])
    grad = np.zeros(km + ks + kn)

    def fg(theta):
        f = _negpenloglik(theta, y, logy, Bm, Bs, Bn, Pm, Ps, Pn, lambdas, grad)
        return f, grad.copy()

    res = minimize(fg, theta0, jac=True, method="L-BFGS-B", options={"maxiter": 2000, "ftol": 1e-12, "gtol": 1e-6})
    theta = res.x
    # effective df: trace((H_pen)^-1 H_unpen) with a finite-difference Hessian of the gradient
    H = _num_hessian(lambda t: fg(t)[1], theta)
    Ppen = np.zeros_like(H)
    Ppen[:km, :km] = 2 * lambdas[0] * Pm
    Ppen[km:km + ks, km:km + ks] = 2 * lambdas[1] * Ps
    Ppen[km + ks:, km + ks:] = 2 * lambdas[2] * Pn
    Hun = H - Ppen
    try:
        A = np.linalg.solve(H, Hun)
        edf_m = float(np.trace(A[:km, :km]))
        edf_s = float(np.trace(A[km:km + ks, km:km + ks]))
        edf_n = float(np.trace(A[km + ks:, km + ks:]))
    except np.linalg.LinAlgError:
        edf_m = edf_s = edf_n = float("nan")
    ll = -_negpenloglik(theta, y, logy, Bm, Bs, Bn, Pm, Ps, Pn, (0.0, 0.0, 0.0), None)
    k = gaic_k if gaic_k is not None else np.log(n)
    gaic = -2 * ll + k * (edf_m + edf_s + edf_n)
    return LMSFit(spec, km_, ks_, kn_, theta[:km], theta[km:km + ks], theta[km + ks:], lambdas, float(ll),
                  (edf_m, edf_s, edf_n), float(gaic), n, {"converged": bool(res.success), "nit": int(res.nit)})


def _num_hessian(gradf, theta, eps: float = 1e-4) -> np.ndarray:
    p = len(theta)
    H = np.zeros((p, p))
    for j in range(p):
        tp = theta.copy(); tp[j] += eps
        tm = theta.copy(); tm[j] -= eps
        H[:, j] = (gradf(tp) - gradf(tm)) / (2 * eps)
    return 0.5 * (H + H.T)


def select_lambdas(x, y, spec, grid_mu, grid_sigma, lam_nu, gaic_k=None, verbose=False) -> LMSFit:
    """Grid search over smoothing parameters for mu and sigma; nu penalty fixed."""
    best = None
    theta0 = None
    for lm in grid_mu:
        for ls in grid_sigma:
            fit = fit_lms(x, y, spec, (lm, ls, lam_nu), theta0=theta0, gaic_k=gaic_k)
            theta0 = np.concatenate([fit.beta_mu, fit.beta_sigma, fit.beta_nu])
            if verbose:
                print(f"  lam_mu={lm:g} lam_sigma={ls:g} ll={fit.loglik:.1f} edf={tuple(round(e, 1) for e in fit.edf)} gaic={fit.gaic:.1f} conv={fit.extra['converged']}")
            if best is None or fit.gaic < best.gaic:
                best = fit
    return best


def calibration_table(z: np.ndarray, x: np.ndarray, nbins: int = 8, centiles=(0.004, 0.02, 0.09, 0.25, 0.5, 0.75, 0.91, 0.98, 0.996)):
    """Observed proportion of z below each nominal centile, by age bin."""
    qs = np.quantile(x, np.linspace(0, 1, nbins + 1))
    rows = []
    for i in range(nbins):
        m = (x >= qs[i]) & (x <= qs[i + 1]) if i == nbins - 1 else (x >= qs[i]) & (x < qs[i + 1])
        zz = z[m]
        rows.append({"bin": i, "n": int(m.sum()), **{f"p{int(c * 1000)}": float(np.mean(zz < norm.ppf(c))) for c in centiles},
                     "mean": float(zz.mean()), "sd": float(zz.std()), "skew": float(((zz - zz.mean()) ** 3).mean() / zz.std() ** 3),
                     "kurt": float(((zz - zz.mean()) ** 4).mean() / zz.std() ** 4 - 3)})
    return rows
