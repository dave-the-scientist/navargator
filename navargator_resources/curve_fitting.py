import numpy as np
from scipy.optimize import curve_fit

def sigmoid_fxn(x, b, m, r):
    # b is the steepness; m is the x_value where curve is at 50% height; r is the max y_value of the curve
    # It's been constrained such that the lower y_bound is always 0.
    return r/2.0 * (b*(m-x) / np.sqrt((b*(m-x))**2 + 1) + 1)

def initial_sigmoid_params(x, y):
    b = 7.0 / max(x)
    m = (max(x) + min(x))/2.0
    r = max(y)
    return [b, m, r]

def fit_to_sigmoid(x, y, r_value=None):
    # If r_value is None, the r parameter will be estimated from the data. Otherwise it will be set to r_value.
    init_params = initial_sigmoid_params(x, y)
    if r_value == None:
        opt_params, cov = curve_fit(sigmoid_fxn, xdata=x, ydata=y, p0=init_params)
    else:
        def sigmoid_constrained(x, b, m):
            return sigmoid_fxn(x, b, m, r_value)
        opt_params, cov = curve_fit(sigmoid_constrained, xdata=x, ydata=y, p0=init_params[:2])
        opt_params = np.append(opt_params, r_value)
    return opt_params
