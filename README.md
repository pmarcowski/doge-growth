# Dog growth curve prediction model and application
This repository contains scripts for building a predictive model of dog growth trajectories and an interactive Shiny web application for generating personalized growth predictions. The model utilizes a Bayesian non-linear mixed effects approach, assuming a biologically-inspired von Bertalanffy growth curve. It incorporates breed and sex as grouping factors to account for variation across different subpopulations. The Shiny application provides an interface for inputting dog characteristics and visualizing predicted growth curves with uncertainty intervals.

## License
This code is licensed under the MIT license found in the LICENSE file in the root directory of this source tree.

## Features
- **Data preparation and analysis**: Includes steps for processing and analyzing dog growth data, ensuring the model is built on clean and relevant information.
- **Bayesian non-linear mixed effects modeling**: Utilizes a robust statistical framework to model growth trajectories while accounting for breed and sex-based variability.
- **Interactive growth prediction**: The Shiny app allows users to input their dog's characteristics and visualize personalized growth predictions with 95% prediction intervals.
- **Prediction checks**: The app includes checks and warnings for potential issues such as negative trends, significant discrepancies between current and typical weight, and unrealistic growth rates.

### Model details
The dog growth prediction model utilizes the von Bertalanffy growth function, a non-linear curve commonly used to model growth in biological systems. The function is mathematically defined as:

$$L_{inf} * (1 - exp(-K * (age - t_0)))$$

where *Linf*, *K*, and *t0* denote parameters related to asymptotic growth length, growth rate, and the hypothetical age at which size is zero, respectively. The model is fitted in a Bayesian framework using the brms package in R, allowing for breed and sex-based parameter variability.

## Usage
The Shiny application serves as the interface for the dog growth prediction model, allowing users to:

- Input their dog's breed, sex, current age, and current weight.
- Choose between using a slider or entering a birth date to specify the dog's age.
- View an interactive plot of the predicted growth curve with uncertainty intervals.
- Receive warnings for potential issues with the input data or predicted growth patterns.

## Installation
1. Ensure R is installed with the necessary packages.
2. Clone this repository or download the necessary files.
3. Run the *build_growth_model.R* script to fit the Bayesian non-linear mixed effects model to your data.
4. Model and data files are copied automatically to be used in the Shiny application.
5. Launch the Shiny application by running the `shiny::runApp()` command in the app directory.

## Disclaimer
The dog growth prediction model and associated Shiny application are for informational and educational purposes only. The predictions are based on a dataset that may not accurately represent the growth patterns of all dog breeds or individual dogs. Various factors, such as genetics, nutrition, health status, and environment, can influence an individual dog's growth. Interpret the predictions as general guidelines, not definitive outcomes. Consult with a veterinary professional for personalized advice and regularly monitor your dog's growth and development.

## Feedback and Questions
Any feedback, suggestions, or experiences you may have regarding this application are welcome. Please feel free to reach out with your comments or questions by opening an issue on the GitHub repository or contacting the author directly.
