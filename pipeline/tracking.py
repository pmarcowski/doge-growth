"""Centile tracking, shared by 03_fit_tracking.py and 07_breed_experiment.py.

A dog's z-scores are one latent trajectory plus measurement noise:
    z(s) = eta(s) + e,   cov(eta(s), eta(s')) = (1 - nugget) * exp(-|s - s'| / ell),   var(e) = nugget,
so corr(z(s), z(s')) = (1 - nugget) * exp(-|s - s'| / ell) for s != s', with s = log age in years (the transform
03_fit_tracking.py selects). The marginal variance is 1 by construction of the z-scores.
"""
from __future__ import annotations

import numpy as np
from scipy.optimize import minimize


def group_blocks(blocks):
    """Stack dogs with the same number of weights (at least two) so the likelihood is evaluated in batches."""
    groups = {}
    for s, z in blocks:
        if len(s) >= 2:
            groups.setdefault(len(s), []).append((s, z))
    return {n: (np.array([b[0] for b in g]), np.array([b[1] for b in g])) for n, g in groups.items()}


def negloglik(params, groups):
    """Negative log-likelihood of (logit nugget, log ell) over stacked dogs."""
    nug = 1 / (1 + np.exp(-params[0]))
    ell = np.exp(params[1])
    total = 0.0
    for n, (S, Z) in groups.items():
        D = np.abs(S[:, :, None] - S[:, None, :])
        K = (1 - nug) * np.exp(-D / ell) + nug * np.eye(n)[None]
        try:
            L = np.linalg.cholesky(K)
        except np.linalg.LinAlgError:
            return 1e12
        alpha = np.linalg.solve(L, Z[..., None])[..., 0]
        total += 0.5 * (alpha * alpha).sum() + np.log(np.diagonal(L, axis1=1, axis2=2)).sum()
    return total


def fit(blocks) -> tuple[float, float, float]:
    """Maximum-likelihood (nugget, ell, negloglik) from per-dog (s, z) arrays."""
    res = minimize(negloglik, x0=[np.log(0.1 / 0.9), np.log(0.5)], args=(group_blocks(blocks),), method="Nelder-Mead",
                   options={"xatol": 1e-4, "fatol": 1e-3})
    return float(1 / (1 + np.exp(-res.x[0]))), float(np.exp(res.x[1])), float(res.fun)


def gp_predict(s_obs, z_obs, s_new, nug, ell) -> tuple[float, float]:
    """Predictive mean and variance of a new measurement z(s_new) given observed z's (nugget included)."""
    D = np.abs(s_obs[:, None] - s_obs[None, :])
    K = (1 - nug) * np.exp(-D / ell) + nug * np.eye(len(s_obs))
    k = (1 - nug) * np.exp(-np.abs(s_obs - s_new) / ell)
    w = np.linalg.solve(K, k)
    return float(w @ z_obs), float(1.0 - w @ k)
