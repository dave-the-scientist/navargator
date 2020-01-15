import numpy as np
from scipy.optimize import curve_fit

def sigmoid_fxn(x, b, r, m):
    """x can be a single value or a numpy array of x_values; b is the steepness; r is the max y_value of the curve; m is the x_value where the curve is at 50% height. The equation has been constrained such that the lower y_bound is always 0."""
    return r/2.0 * (b*(m-x) / np.sqrt((b*(m-x))**2 + 1) + 1)

def initial_sigmoid_params(x, y):
    """Reasonable initial guesses for the parameters."""
    b = 7.0 / max(x)
    r = max(y)
    m = (max(x) + min(x)) / 2.0
    return [b, r, m]

def fit_to_sigmoid(x, y, r_value=None):
    """Expects x and y to be lists of floats. If r_value is None, the r parameter will be estimated from the data. Otherwise it will be constrained to r_value."""
    init_params = initial_sigmoid_params(x, y)
    if r_value == None:
        opt_params, cov = curve_fit(sigmoid_fxn, xdata=x, ydata=y, p0=init_params)
    else:
        def sigmoid_constrained(x, b, m):
            return sigmoid_fxn(x, b, r_value, m)
        init_params = [init_params[0], init_params[2]]
        opt_params, cov = curve_fit(sigmoid_constrained, xdata=x, ydata=y, p0=init_params)
        opt_params = np.append(opt_params, r_value)                    # Why do I have both
        opt_params = np.array([opt_params[0], r_value, opt_params[1]]) # of these calls?
    return opt_params


def multi_sigmoid_fxn(*args):
    """Expects args = xs, b, r, m0, m1, m2...; xs is a list of lists, where each sublist contains the x_values for one data set; b is the steepness; r is the max y_value of the curves; m is the x_value where the curve is at 50% height. The b and r parameters are shared and so will be applied to all data sets, while each data set has its own m value. The equation has been constrained such that the lower y_bound is always 0."""
    xs, b, r = args[:3]
    ms = args[3:]
    y_vals = [r/2.0 * (b*(m-x_vals) / np.sqrt((b*(m-x_vals))**2 + 1) + 1) for x_vals, m in zip(xs, ms)]
    return np.hstack(y_vals) # flattens the values

def fit_multiple_sigmoids(xs, ys, r_value=None):
    y_data = np.hstack(ys)
    bs, rs, ms = [], [], []
    for x_vals, y_vals in zip(xs, ys):
        b, r, m = initial_sigmoid_params(x_vals, y_vals)
        bs.append(b)
        rs.append(r)
        ms.append(m)
    if r_value == None:
        init_params = [sum(bs)/float(len(bs)), sum(rs)/float(len(rs))] + ms
        opt_params, cov = curve_fit(multi_sigmoid_fxn, xdata=xs, ydata=y_data, p0=init_params)
    else:
        def multi_sigmoid_constrained(*args):
            xs, b = args[:2]
            ms = args[2:]
            return multi_sigmoid_fxn(xs, b, r_value, *ms)
        init_params = [init_params[0]] + init_params[2:]
        opt_params, cov = curve_fit(multi_sigmoid_constrained, xdata=xs, ydata=y_data, p0=init_params)
        opt_params = np.array([opt_params[0], r_value] + opt_params[1:])
    return opt_params
