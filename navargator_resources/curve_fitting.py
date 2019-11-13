import numpy as np
from scipy.optimize import curve_fit

def sigmoid_fxn(x, b, m, r):
    # b is the steepness; m is the x_value where curve is at 50%; and r is the max y_value of the curve
    # It's been constrained such that the lower y_bound is 0.
    return r/2.0 * (b*(m-x) / np.sqrt((b*(m-x))**2 + 1) + 1)

def initial_sigmoid_params(x, y):
    b = 7.0 / max(x)
    m = (max(x) + min(x))/2.0
    r = max(y)
    return [b, m, r]

def fit_to_sigmoid(x, y):
    init_params = initial_sigmoid_params(x, y)
    opt_params, cov = curve_fit(sigmoid_fxn, xdata=x, ydata=y, p0=init_params)
    return opt_params
